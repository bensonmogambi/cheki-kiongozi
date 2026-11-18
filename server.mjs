import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const root = path.dirname(fileURLToPath(import.meta.url));
const storeDir = process.env.SCORECARD_DATA_DIR || path.join(root, 'data');
const storePath = path.join(storeDir, 'scorecard.json');
const sessions = new Map();
const voterSessions = new Map();
const verificationChallenges = new Map();
const attempts = new Map();
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const offices = ['Governor', 'Senator', 'MP', 'Woman Representative', 'MCA', 'CEC', 'Chief Officer', 'Ward Administrator', 'NG-CDF Fund Manager'];
const officeArea = { 'Governor':'county', 'Senator':'county', 'Woman Representative':'county', 'MP':'constituency', 'MCA':'ward', 'CEC':'county', 'Chief Officer':'county', 'Ward Administrator':'ward', 'NG-CDF Fund Manager':'constituency' };
const setupToken = randomBytes(24).toString('hex');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
let state;

function newState() { return { users: [], ratings: [], reports: [], audit: [], settings:{thresholds:{},bands:{}} }; }
function saveState() {
  fs.mkdirSync(storeDir, { recursive: true });
  const temp = `${storePath}.tmp`;
  if (fs.existsSync(storePath)) fs.copyFileSync(storePath, `${storePath}.bak`);
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, storePath);
}
function loadState() {
  fs.mkdirSync(storeDir, { recursive: true });
  if (!fs.existsSync(storePath)) { state = newState(); saveState(); }
  else {
    try { state = JSON.parse(fs.readFileSync(storePath, 'utf8')); }
    catch { throw new Error(`Could not read ${storePath}. Move the damaged file aside and restart.`); }
    state.users ??= []; state.ratings ??= []; state.reports ??= []; state.audit ??= []; state.settings ??= {thresholds:{},bands:{}}; state.settings.thresholds ??= {}; state.settings.bands ??= {};
  }
}
function seedSourceExamples() {
  const sourceUrl = 'https://njoro.ngcdf.go.ke/wp-content/uploads/2026/10/Njoro.pdf';
  const examples = [
    { key:'njoro-fy2425-item6', title:'Bagaria Primary School — tree planting and water tank', detail:'The approved FY 2024/25 project list describes planting 2,000 tree seedlings and installing a 5,000-litre water tank. The source marks this proposal “New”. This is a budget proposal, not evidence of completed work.', amountValue:400000, sourceLocator:'PDF page 1, item 6' },
    { key:'njoro-fy2425-item11', title:'Analat Primary School — two classrooms', detail:'The approved FY 2024/25 project list describes construction to completion of two classrooms and marks the proposal “New”. This is a budget proposal, not evidence of completed work.', amountValue:2200000, sourceLocator:'PDF page 2, item 11' },
    { key:'njoro-fy2425-item20', title:'Kusumek Primary School — classroom completion', detail:'The approved FY 2024/25 project list describes completion of two classrooms and marks the proposal “Ongoing”. This is a paper status only; Cheki Kiongozi has not verified the site.', amountValue:200000, projectStatus:'ongoing', sourceLocator:'PDF page 3, item 20' },
    { key:'njoro-fy2425-item45', title:'Kenyatta Mixed Day Secondary School — administration block', detail:'The approved FY 2024/25 project list describes completion of an administration block with four offices and marks the proposal “Ongoing”. This is a paper status only; Cheki Kiongozi has not verified the site.', amountValue:1200000, projectStatus:'ongoing', sourceLocator:'PDF page 5, item 45' },
  ];
  let changed = false;
  for (const item of examples) {
    if (state.reports.some(record => record.seedKey === item.key)) continue;
    const record = { id:randomBytes(12).toString('hex'), seedKey:item.key, type:'project', office:'NG-CDF Fund Manager', leader:'Njoro Constituency NG-CDF Office', county:'Nakuru', area:'Njoro', financialYear:'2024/25', fundType:'ng_cdf', fundName:'Njoro NG-CDF', title:item.title, detail:item.detail, amountType:'approved_project_budget', amountValue:item.amountValue, currency:'KES', auditCategory:'', managementResponse:'', queryStatus:'', projectStatus:item.projectStatus||'not_reported', groundStatus:'not_reported', promiseStatus:'', reportPage:'', sourceLocator:item.sourceLocator, evidenceClass:'official_source', sourceLabel:'NG-CDF Njoro Constituency — approved project proposals', sourceUrl, sourceReviewed:false, termsCleared:false, status:'draft', createdBy:'system-seed', createdAt:new Date().toISOString(), publishedAt:null };
    state.reports.push(record); state.audit.push({ action:'source_demo_record_added', actor:'system', subject:record.id, at:record.createdAt }); changed = true;
  }
  if (changed) saveState();
}
function send(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': typeof payload === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'", ...headers });
  res.end(body);
}
function json(res, status, data, headers) { send(res, status, data, headers); }
function cookies(req) { return Object.fromEntries((req.headers.cookie ?? '').split(';').map(v => v.trim()).filter(Boolean).map(v => { const i = v.indexOf('='); return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))]; })); }
function currentUser(req) {
  const token = cookies(req).ck_session;
  const entry = token && sessions.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return state.users.find(u => u.id === entry.userId) ?? null;
}
function currentVoter(req) {
  const token = cookies(req).ck_voter;
  const entry = token && voterSessions.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { voterSessions.delete(token); return null; }
  return entry;
}
function sessionCookie(token, req) {
  const secure = process.env.NODE_ENV === 'production' || (req.headers['x-forwarded-proto'] === 'https');
  return `ck_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure ? '; Secure' : ''}`;
}
function voterCookie(token, req) {
  const secure = process.env.NODE_ENV === 'production' || (req.headers['x-forwarded-proto'] === 'https');
  return `ck_voter=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure ? '; Secure' : ''}`;
}
function requireRole(req, res, roles) {
  const user = currentUser(req);
  if (!user) { json(res, 401, { error: 'Please sign in to continue.' }); return null; }
  if (!roles.includes(user.role)) { json(res, 403, { error: 'This account does not have access to that area.' }); return null; }
  return user;
}
function limited(req, res, key, max = 12) {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const record = attempts.get(`${key}:${ip}`) ?? { start: now, count: 0 };
  if (now - record.start > 15 * 60 * 1000) { record.start = now; record.count = 0; }
  record.count++;
  attempts.set(`${key}:${ip}`, record);
  if (record.count <= max) return false;
  json(res, 429, { error: 'Too many attempts. Please wait and try again.' });
  return true;
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 24_000) throw new Error('Request is too large.');
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw new Error('Please send valid form data.'); }
}
function validEmail(v) { return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function clean(v, max = 180) { return typeof v === 'string' ? v.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, max) : ''; }
async function makeUser(email, password, role, extra = {}) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return { id: randomBytes(12).toString('hex'), email: email.toLowerCase(), salt: salt.toString('hex'), passwordHash: Buffer.from(derived).toString('hex'), role, createdAt: new Date().toISOString(), ...extra };
}
async function passwordMatches(user, password) {
  const hash = Buffer.from(await scrypt(password, Buffer.from(user.salt, 'hex'), 64));
  return timingSafeEqual(hash, Buffer.from(user.passwordHash, 'hex'));
}
function publicUser(user) { return { id: user.id, email: user.email, role: user.role, county: user.county ?? '', constituency: user.constituency ?? '', ward: user.ward ?? '', identityStatus: user.identityStatus ?? 'not_verified' }; }
function financialCycle(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Nairobi', year:'numeric', month:'numeric', day:'numeric' }).formatToParts(now).map(p => [p.type,p.value]));
  const year = Number(parts.year), month = Number(parts.month), start = month >= 7 ? year : year - 1, end = start + 1;
  return { fy:`${start}/${String(end).slice(-2)}`, startYear:start, closes:`${end}-06-30` };
}
function thresholdForOffice(office) {
  const key = office.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const raw = state?.settings?.thresholds?.[office] ?? process.env[`MIN_VOTES_${key}`] ?? process.env.MIN_VOTES_TO_PUBLISH ?? '';
  const n = Number(raw); return Number.isInteger(n) && n > 0 ? n : (process.env.MVP_DEMO_MODE === 'true' ? 1 : null);
}
function letterForScore(score) {
  const demo=process.env.MVP_DEMO_MODE==='true';
  const bands=state?.settings?.bands||{};
  const a=Number(bands.A??(demo?(process.env.GRADE_A_MIN||8.5):process.env.GRADE_A_MIN)), b=Number(bands.B??(demo?(process.env.GRADE_B_MIN||7):process.env.GRADE_B_MIN)), c=Number(bands.C??(demo?(process.env.GRADE_C_MIN||5):process.env.GRADE_C_MIN)), d=Number(bands.D??(demo?(process.env.GRADE_D_MIN||3):process.env.GRADE_D_MIN));
  if (![a,b,c,d].every(Number.isFinite) || a>10 || d<1 || !(a>b&&b>c&&c>d)) return null;
  return score>=a?'A':score>=b?'B':score>=c?'C':score>=d?'D':'E';
}
function redirect(res, url, cookie) { res.writeHead(303, { Location: url, 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) }); res.end(); }
function serveFile(res, name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'" });
  fs.createReadStream(file).pipe(res);
}

loadState();
seedSourceExamples();
const protectedPages = new Map([
  ['/admin', { file: 'admin.html', roles: ['admin'] }],
]);
const assets = new Set(['pages.css', 'theme.css', 'home.css', 'auth.css', 'pages.js', 'auth.js', 'app-pages.js', 'method.js', 'pwa.js', 'manifest.webmanifest', 'service-worker.js', 'assets/kenya-landscape.svg']);
function verificationConfig() {
  if (process.env.MVP_DEMO_MODE === 'true') return { enabled:true, demo:true, providerName:'Local demo check', privacyUrl:'' };
  const start = process.env.IDENTITY_PROVIDER_START_URL || '';
  const confirm = process.env.IDENTITY_PROVIDER_CONFIRM_URL || '';
  const secret = process.env.IDENTITY_HASH_SECRET || '';
  let validUrls = false;
  try { validUrls = new URL(start).protocol === 'https:' && new URL(confirm).protocol === 'https:'; } catch { /* provider not configured */ }
  const enabled = process.env.IDENTITY_PROCESSING_APPROVED === 'true' && validUrls && Boolean(process.env.IDENTITY_PROVIDER_TOKEN) && secret.length >= 32 && Boolean(process.env.IDENTITY_PROVIDER_NAME);
  return { enabled, providerName: enabled ? process.env.IDENTITY_PROVIDER_NAME : '', privacyUrl: enabled ? (process.env.IDENTITY_PROVIDER_PRIVACY_URL || '') : '' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (req.method === 'GET' && pathname === '/') return serveFile(res, 'index.html');
    if (req.method === 'GET' && pathname === '/vote') {
      let token = cookies(req).ck_voter;
      if (!token || !voterSessions.has(token)) { token = randomBytes(32).toString('hex'); voterSessions.set(token, { expiresAt: Date.now() + sessionLifetimeMs }); }
      res.setHeader('Set-Cookie', voterCookie(token, req));
      return serveFile(res, 'vote.html');
    }
    if (req.method === 'GET' && pathname === '/method') return serveFile(res, 'method.html');
    if (req.method === 'GET' && pathname === '/results') return serveFile(res, 'results.html');
    if (req.method === 'GET' && pathname === '/scorecard') return serveFile(res, 'scorecard.html');
    if (req.method === 'GET' && pathname === '/register') return redirect(res, '/vote');
    if (req.method === 'GET' && ['/login', '/setup'].includes(pathname)) return serveFile(res, `${pathname.slice(1)}.html`);
    if (req.method === 'GET' && assets.has(pathname.slice(1))) return serveFile(res, pathname.slice(1));
    if (req.method === 'GET' && protectedPages.has(pathname)) {
      const user = currentUser(req);
      if (!user) return redirect(res, `/login?next=${encodeURIComponent(pathname)}`);
      const page = protectedPages.get(pathname);
      if (!page.roles.includes(user.role)) return send(res, 403, 'This area is not available to your account. <a href="/login">Sign in with the correct account</a>.');
      return serveFile(res, page.file);
    }
    if (pathname.endsWith('.html') || pathname === '/index.html') return send(res, 404, 'Page not found');

    if (req.method === 'GET' && pathname === '/api/me') {
      const user = currentUser(req);
      return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'Sign in required.' });
    }
    if (req.method === 'GET' && pathname === '/api/voter/session') {
      let token = cookies(req).ck_voter, voter = currentVoter(req);
      if (!voter) { token = randomBytes(32).toString('hex'); voter = { expiresAt: Date.now() + sessionLifetimeMs }; voterSessions.set(token, voter); }
      return json(res, 200, { identityStatus: voter.voterHash ? 'verified' : 'not_verified', ...verificationConfig(), financialYear: financialCycle().fy, cycleCloses: financialCycle().closes }, { 'Set-Cookie': voterCookie(token, req) });
    }
    if (req.method === 'GET' && pathname === '/api/method') {
      const demo=process.env.MVP_DEMO_MODE==='true',saved=state.settings.bands;
      const bands={A:Number(saved.A??(demo?(process.env.GRADE_A_MIN||8.5):process.env.GRADE_A_MIN)),B:Number(saved.B??(demo?(process.env.GRADE_B_MIN||7):process.env.GRADE_B_MIN)),C:Number(saved.C??(demo?(process.env.GRADE_C_MIN||5):process.env.GRADE_C_MIN)),D:Number(saved.D??(demo?(process.env.GRADE_D_MIN||3):process.env.GRADE_D_MIN))};
      const bandsConfigured=Object.values(bands).every(Number.isFinite)&&bands.A<=10&&bands.D>=1&&bands.A>bands.B&&bands.B>bands.C&&bands.C>bands.D;
      return json(res,200,{financialYear:financialCycle().fy,offices,thresholds:Object.fromEntries(offices.map(office=>[office,thresholdForOffice(office)])),scale:{min:1,max:10},citizenCategories:['Roads','Water','Health','Education and bursaries','Jobs and youth','Corruption','Availability'],peopleGrade:'Mean each verified voter’s answered categories, then average across eligible voters; newest grade per voter/leader/financial year counts.',letterBands:bandsConfigured?bands:null,evidenceComponents:[{name:'Verified projects',weight:35},{name:'Audit health',weight:30},{name:'Promises',weight:20},{name:'Budget execution',weight:15}],missingEvidence:'Exclude unavailable Evidence Grade components and renormalize remaining weights; display the number of components used.',combinedGrade:false,areaRule:'Pilot voter area is declared residence entered with the rating; official ward eligibility still needs verified boundary data and enforcement.',status:'provisional'});
    }
    if (req.method === 'POST' && pathname === '/api/login') {
      if (limited(req, res, 'login')) return;
      const data = await readBody(req);
      const email = clean(data.email, 254).toLowerCase();
      const user = state.users.find(u => u.email === email);
      const ok = user && typeof data.password === 'string' && data.password.length <= 200 && await passwordMatches(user, data.password);
      if (!ok) return json(res, 401, { error: 'Email or password is incorrect.' });
      const old = cookies(req).ck_session;
      if (old) sessions.delete(old);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + sessionLifetimeMs });
      const defaultDestination = { resident: '/vote', admin: '/admin', results: '/results' }[user.role];
      let destination = defaultDestination;
      if (typeof data.next === 'string' && data.next.startsWith('/') && !data.next.startsWith('//')) {
        const requested = new URL(data.next, 'http://localhost');
        const allowed = user.role === 'admin' ? requested.pathname === '/admin' : user.role === 'results' ? ['/results', '/scorecard'].includes(requested.pathname) : requested.pathname === '/vote';
        if (allowed) destination = `${requested.pathname}${requested.search}${requested.hash}`;
      }
      return json(res, 200, { user: publicUser(user), redirect: destination }, { 'Set-Cookie': sessionCookie(token, req) });
    }
    if (req.method === 'POST' && pathname === '/api/logout') {
      const token = cookies(req).ck_session;
      if (token) sessions.delete(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'ck_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (req.method === 'POST' && pathname === '/api/register') {
      return json(res, 410, { error: 'Resident accounts are not needed. Verify your ID and rate directly at /vote.' });
      const data = await readBody(req);
      const email = clean(data.email, 254).toLowerCase();
      if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address.' });
      if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 200) return json(res, 400, { error: 'Use a password of at least 12 characters.' });
      if (state.users.some(u => u.email === email)) return json(res, 409, { error: 'An account already uses this email.' });
      const county = clean(data.county, 80), constituency = clean(data.constituency, 100), ward = clean(data.ward, 100);
      if (!county || !constituency) return json(res, 400, { error: 'Choose your county and constituency.' });
      const user = await makeUser(email, data.password, 'resident', { county, constituency, ward, identityStatus: 'not_verified' });
      state.users.push(user); saveState();
      state.audit.push({ action: 'resident_registered', actor: user.id, at: new Date().toISOString() }); saveState();
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + sessionLifetimeMs });
      return json(res, 201, { user: publicUser(user), redirect: '/vote' }, { 'Set-Cookie': sessionCookie(token, req) });
    }
    if (req.method === 'POST' && pathname === '/api/setup-admin') {
      if (limited(req, res, 'setup', 5)) return;
      if (state.users.some(u => u.role === 'admin')) return json(res, 409, { error: 'Admin setup is already complete.' });
      const data = await readBody(req);
      if (data.setupToken !== setupToken) return json(res, 403, { error: 'The one-time setup link is invalid. Use the link printed by the server.' });
      const email = clean(data.email, 254).toLowerCase();
      if (!validEmail(email) || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 200) return json(res, 400, { error: 'Enter a valid email and a password of at least 12 characters.' });
      if (state.users.some(u => u.email === email)) return json(res, 409, { error: 'This email already has an account.' });
      const user = await makeUser(email, data.password, 'admin');
      state.users.push(user); saveState();
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + sessionLifetimeMs });
      return json(res, 201, { redirect: '/admin' }, { 'Set-Cookie': sessionCookie(token, req) });
    }
    if (req.method === 'POST' && pathname === '/api/ratings') {
      const voter = currentVoter(req);
      const identityHash = voter?.voterHash;
      if (!identityHash) return json(res, 403, { error: 'Verify your ID through the approved identity-check service before submitting a rating.' });
      const data = await readBody(req);
      const office = clean(data.office, 40);
      if (!offices.includes(office)) return json(res, 400, { error: 'Choose a valid office.' });
      const leader = clean(data.leader, 120);
      const areaType = officeArea[office];
      const county = clean(data.county, 80), constituency = clean(data.constituency, 100), ward = clean(data.ward, 100);
      const area = areaType === 'ward' ? ward : areaType === 'constituency' ? constituency : county;
      if (!county || !constituency) return json(res, 400, { error: 'Enter your county and constituency to place your rating in the right area.' });
      if (!leader || (areaType === 'ward' && !ward)) return json(res, 400, { error: areaType === 'ward' ? 'Enter your ward before grading a ward leader.' : 'Select a leader.' });
      const scores = {};
      for (const key of ['roads', 'water', 'health', 'education', 'jobs', 'availability', 'corruption']) {
        const value = data.scores?.[key];
        if (value === '' || value === null || value === undefined) continue;
        const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 10) return json(res, 400, { error: 'Each rating must be from 1 to 10.' }); scores[key] = n;
      }
      if (!Object.keys(scores).length) return json(res, 400, { error: 'Rate at least one area before submitting.' });
      const cycle=financialCycle(), now=new Date().toISOString();
      const actor = `verified-voter:${identityHash.slice(0,12)}`;
      const existing=state.ratings.find(r=>r.voterHash===identityHash&&r.office===office&&r.leader.toLowerCase()===leader.toLowerCase()&&r.fy===cycle.fy);
      if(existing){const before={scores:existing.scores,comment:existing.comment};existing.scores=scores;existing.comment=clean(data.comment,500);existing.county=county;existing.constituency=constituency;existing.ward=ward;existing.area=area;existing.updatedAt=now;existing.voteStatus='pending_review';existing.commentStatus='private_pending_review';existing.counted=false;existing.reviewedAt=null;state.audit.push({action:'rating_updated',actor,subject:existing.id,before,after:{scores,comment:existing.comment},at:now});saveState();return json(res,200,{ok:true,message:`Your latest rating for FY ${cycle.fy} replaced your earlier one. It is private and awaiting review.`});}
      const rating = { id: randomBytes(12).toString('hex'), userId: null, voterHash: identityHash, county, constituency, ward, area, areaType, office, leader, fy:cycle.fy, scores, comment: clean(data.comment, 500), identityStatus: 'verified', voteStatus: 'pending_review', commentStatus: 'private_pending_review', counted: false, createdAt: now, updatedAt: now };
      state.ratings.push(rating); state.audit.push({action:'rating_submitted',actor,subject:rating.id,after:{office,leader,fy:cycle.fy},at:now});saveState();
      return json(res, 201, { ok: true, message: `Your verified rating for FY ${cycle.fy} is saved privately and awaits admin review.` });
    }
    if (req.method === 'GET' && pathname === '/api/voter/ratings') {
      const voter = currentVoter(req); if (!voter?.voterHash) return json(res, 401, { error: 'Verify your identity first.' });
      return json(res, 200, { ratings: state.ratings.filter(r => r.voterHash === voter.voterHash).map(({ userId, voterHash, ...r }) => r), financialYear:financialCycle().fy, cycleCloses:financialCycle().closes });
    }
    if (req.method === 'GET' && pathname === '/api/my-ratings') {
      const user = requireRole(req, res, ['resident']); if (!user) return;
      return json(res, 200, { ratings: state.ratings.filter(r => r.userId === user.id).map(({ userId, voterHash, ...r }) => r), financialYear:financialCycle().fy, cycleCloses:financialCycle().closes });
    }
    if (req.method === 'GET' && (pathname === '/api/verification/config' || pathname === '/api/voter/verification/config')) {
      if (pathname.startsWith('/api/voter/')) return json(res, 200, { ...verificationConfig(), identityStatus: currentVoter(req)?.voterHash ? 'verified' : 'not_verified', financialYear:financialCycle().fy, cycleCloses:financialCycle().closes, offices });
      const user = requireRole(req, res, ['resident']); if (!user) return;
      return json(res, 200, { ...verificationConfig(), identityStatus: user.identityStatus ?? 'not_verified', financialYear:financialCycle().fy, cycleCloses:financialCycle().closes, offices });
    }
    if (req.method === 'POST' && (pathname === '/api/verification/start' || pathname === '/api/voter/verification/start')) {
      const guest = pathname.startsWith('/api/voter/');
      const user = guest ? null : requireRole(req, res, ['resident']); if (!guest && !user) return;
      const voter = guest ? currentVoter(req) : null;
      if (guest && !voter) return json(res, 401, { error: 'Refresh the rating page and start again.' });
      if (limited(req, res, 'identity-start', 4)) return;
      const config = verificationConfig();
      if (!config.enabled) return json(res, 503, { error: 'Identity verification is unavailable. No ID number or phone was collected or stored.' });
      if (guest ? Boolean(voter.voterHash) : user.identityStatus === 'verified') return json(res, 409, { error: 'This voter session is already verified.' });
      const data = await readBody(req);
      const nationalId = typeof data.nationalId === 'string' ? data.nationalId.replace(/[\s-]/g, '') : '';
      const phone = typeof data.phone === 'string' ? data.phone.replace(/[\s()-]/g, '') : '';
      if (!/^\d{6,12}$/.test(nationalId)) return json(res, 400, { error: 'Enter a valid national ID number.' });
      if (!/^\+?\d{9,15}$/.test(phone)) return json(res, 400, { error: 'Enter a valid phone number.' });
      if (data.consent !== true) return json(res, 400, { error: 'Consent is required before sending your details to the verification provider.' });
      if (config.demo) {
        const secret=process.env.MVP_DEMO_SECRET||'cheki-kiongozi-local-demo-only-do-not-deploy';
        const identityHash=createHmac('sha256',secret).update(nationalId).digest('hex');
        const challengeId=randomBytes(24).toString('hex');
        verificationChallenges.set(challengeId,{userId:null,voterToken:cookies(req).ck_voter,identityHash,expiresAt:Date.now()+10*60*1000,attempts:0});
        return json(res,200,{challengeId,providerName:config.providerName,expiresInSeconds:600,message:`Local demo only: use OTP ${process.env.MVP_DEMO_OTP||'000000'}. No identity database or phone network is checked.`});
      }
      let providerResponse;
      try {
        providerResponse = await fetch(process.env.IDENTITY_PROVIDER_START_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.IDENTITY_PROVIDER_TOKEN}` }, body: JSON.stringify({ nationalId, phone, purpose: 'civic-voter-verification' }), signal: AbortSignal.timeout(15000) });
      } catch { return json(res, 502, { error: 'The licensed verification provider could not be reached. Your ID and phone were not saved.' }); }
      if (!providerResponse.ok) return json(res, 502, { error: 'The verification provider could not start a check. Your ID and phone were not saved.' });
      let providerData;
      try { providerData = await providerResponse.json(); } catch { return json(res, 502, { error: 'The verification provider returned an invalid response. Your ID and phone were not saved.' }); }
      const providerChallenge = clean(providerData.challengeId, 300);
      if (providerData.status !== 'otp_sent' || !providerChallenge) return json(res, 502, { error: 'The provider did not confirm that an OTP was sent. Your ID and phone were not saved.' });
      const challengeId = randomBytes(24).toString('hex');
      verificationChallenges.set(challengeId, { userId: user?.id || null, voterToken: guest ? cookies(req).ck_voter : null, providerChallenge, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
      return json(res, 200, { challengeId, providerName: config.providerName, expiresInSeconds: 600, message: `Enter the one-time code sent to the phone registered with your ID by ${config.providerName}.` });
    }
    if (req.method === 'POST' && (pathname === '/api/verification/complete' || pathname === '/api/voter/verification/complete')) {
      const guest = pathname.startsWith('/api/voter/');
      const user = guest ? null : requireRole(req, res, ['resident']); if (!guest && !user) return;
      const voter = guest ? currentVoter(req) : null;
      if (guest && !voter) return json(res, 401, { error: 'Refresh the rating page and start again.' });
      if (limited(req, res, 'identity-complete', 8)) return;
      const config = verificationConfig();
      if (!config.enabled) return json(res, 503, { error: 'Identity verification is unavailable.' });
      const data = await readBody(req);
      const challengeId = clean(data.challengeId, 100); const otp = typeof data.otp === 'string' ? data.otp.replace(/\s/g, '') : '';
      const challenge = verificationChallenges.get(challengeId);
      if (!challenge || challenge.expiresAt < Date.now() || (guest ? challenge.voterToken !== cookies(req).ck_voter : challenge.userId !== user.id)) return json(res, 400, { error: 'That verification session has expired. Start again.' });
      if (!/^\d{4,10}$/.test(otp)) return json(res, 400, { error: 'Enter the one-time code from your phone.' });
      challenge.attempts++;
      if (challenge.attempts > 5) { verificationChallenges.delete(challengeId); return json(res, 429, { error: 'Too many code attempts. Start verification again.' }); }
      if (config.demo) {
        if (otp !== (process.env.MVP_DEMO_OTP||'000000')) return json(res,400,{error:'Demo code did not match. Use the code shown above.'});
        challenge.demoVerified=true;
      }
      if (config.demo && challenge.demoVerified) {
        const identityHash=challenge.identityHash;
        verificationChallenges.delete(challengeId);
        const voterToken=cookies(req).ck_voter, voter=voterToken&&voterSessions.get(voterToken);
        if(!voter)return json(res,401,{error:'Refresh the rating page and start again.'});
        voter.voterHash=identityHash;
        const verifiedAt=new Date().toISOString();state.audit.push({action:'demo_identity_verified',actor:`demo-voter:${identityHash.slice(0,12)}`,at:verifiedAt});saveState();
        return json(res,200,{ok:true,identityStatus:'verified',message:'Demo identity accepted locally. This does not verify a real person or national ID.'});
      }
      let providerResponse;
      try {
        providerResponse = await fetch(process.env.IDENTITY_PROVIDER_CONFIRM_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.IDENTITY_PROVIDER_TOKEN}` }, body: JSON.stringify({ challengeId: challenge.providerChallenge, otp }), signal: AbortSignal.timeout(15000) });
      } catch { return json(res, 502, { error: 'The verification provider could not be reached. Try again.' }); }
      if (!providerResponse.ok) return json(res, 400, { error: 'The verification provider did not accept that code. Check it and try again.' });
      let providerData;
      try { providerData = await providerResponse.json(); } catch { return json(res, 502, { error: 'The verification provider returned an invalid response.' }); }
      if (providerData.verified !== true || typeof providerData.subjectReference !== 'string' || providerData.subjectReference.length < 16 || providerData.subjectReference.length > 500) return json(res, 400, { error: 'The provider has not verified this ID and registered phone.' });
      const identityHash = createHmac('sha256', process.env.IDENTITY_HASH_SECRET).update(providerData.subjectReference).digest('hex');
      const otherAccount = !guest && state.users.find(u => u.id !== user.id && u.identityHash === identityHash);
      if (otherAccount) { verificationChallenges.delete(challengeId); return json(res, 409, { error: 'This verified identity is already linked to another account. Contact support.' }); }
      const verifiedAt = new Date().toISOString();
      if (guest) voter.voterHash = identityHash;
      else { user.identityHash = identityHash; user.identityStatus = 'verified'; user.verifiedAt = verifiedAt; for (const rating of state.ratings.filter(r => r.userId === user.id)) { rating.identityStatus = 'verified'; rating.voterHash = identityHash; rating.voteStatus = 'pending_review'; } }
      verificationChallenges.delete(challengeId); state.audit.push({ action: 'voter_identity_verified', actor: user?.id || `verified-voter:${identityHash.slice(0,12)}`, at: verifiedAt }); saveState();
      return json(res, 200, { ok: true, identityStatus: 'verified', message: 'Identity matched by the verification provider. Your vote can now be submitted privately for review; it will only count after review and the publication threshold.' });
    }
    if (req.method === 'GET' && pathname === '/api/results') {
      const published = state.ratings.filter(r => r.counted === true && r.identityStatus === 'verified');
      const groups = new Map();
      for (const rating of published) {
        const key = [rating.office, rating.leader.toLowerCase(), rating.county, rating.area, rating.fy].join('|');
        const group = groups.get(key) ?? { office: rating.office, leader: rating.leader, county:rating.county, area: rating.area, fy:rating.fy, votes: new Map() };
        group.votes.set(rating.voterHash,rating); groups.set(key, group);
      }
      const eligible = [...groups.values()].map(group=>{
        const threshold=thresholdForOffice(group.office);const votes=[...group.votes.values()];
        const voterMeans=votes.map(v=>{const vals=Object.values(v.scores).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}).filter(Number.isFinite);
        const score=voterMeans.length?voterMeans.reduce((a,b)=>a+b,0)/voterMeans.length:null;
        const categories={};for(const category of ['roads','water','health','education','jobs','corruption','availability']){const values=votes.map(v=>v.scores[category]).filter(Number.isFinite);if(values.length)categories[category]=Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(1));}
        return {office:group.office,leader:group.leader,county:group.county,area:group.area,fy:group.fy,voteCount:group.votes.size,threshold,score:score===null?null:Number(score.toFixed(1)),letter:score===null?null:letterForScore(score),categoryScores:categories};
      }).filter(g=>g.threshold&&g.voteCount>=g.threshold);
      const reports = state.reports.filter(r => r.status === 'published').map(({ createdBy, ...r }) => r);
      const demo=process.env.MVP_DEMO_MODE==='true',saved=state.settings.bands;
      const letterBands={A:Number(saved.A??(demo?(process.env.GRADE_A_MIN||8.5):process.env.GRADE_A_MIN)),B:Number(saved.B??(demo?(process.env.GRADE_B_MIN||7):process.env.GRADE_B_MIN)),C:Number(saved.C??(demo?(process.env.GRADE_C_MIN||5):process.env.GRADE_C_MIN)),D:Number(saved.D??(demo?(process.env.GRADE_D_MIN||3):process.env.GRADE_D_MIN))};
      const bandsConfigured=Object.values(letterBands).every(Number.isFinite)&&letterBands.A<=10&&letterBands.D>=1&&letterBands.A>letterBands.B&&letterBands.B>letterBands.C&&letterBands.C>letterBands.D;
      const thresholds=Object.fromEntries(offices.map(office=>[office,thresholdForOffice(office)]));
      return json(res, 200, { demoMode:process.env.MVP_DEMO_MODE==='true',publishedRatings: eligible.reduce((sum, g) => sum + g.voteCount, 0), eligibleLeaders:eligible, thresholds, letterBands:bandsConfigured?letterBands:null, reports, financialYear:financialCycle().fy, note: 'People’s score is the mean of each verified resident’s answered categories, averaged across eligible voters. Evidence Grade remains separate and requires verified project and official source data.' });
    }
    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const user = requireRole(req, res, ['admin']); if (!user) return;
      return json(res, 200, { demoMode:process.env.MVP_DEMO_MODE==='true',ratings: state.ratings.map(({ userId, voterHash, ...r }) => r), reports: state.reports, resultsAccountCount: state.users.filter(u => u.role === 'results').length, settings:{thresholds:Object.fromEntries(offices.map(office=>[office,thresholdForOffice(office)])),bands:state.settings.bands} });
    }
    if (req.method === 'POST' && pathname === '/api/admin/settings') {
      const actor=requireRole(req,res,['admin']);if(!actor)return;
      const data=await readBody(req),minimum=Number(data.minimumVotes),bands={A:Number(data.gradeA),B:Number(data.gradeB),C:Number(data.gradeC),D:Number(data.gradeD)};
      if(!Number.isInteger(minimum)||minimum<1||minimum>100000)return json(res,400,{error:'The publication minimum must be a whole number from 1 to 100,000.'});
      if(!Object.values(bands).every(Number.isFinite)||bands.A>10||bands.D<1||!(bands.A>bands.B&&bands.B>bands.C&&bands.C>bands.D))return json(res,400,{error:'Set grade bands in descending order from 10 to 1.'});
      const before=structuredClone(state.settings);state.settings={thresholds:Object.fromEntries(offices.map(office=>[office,minimum])),bands};
      const at=new Date().toISOString();state.audit.push({action:'publication_method_updated',actor:actor.id,before,after:state.settings,at});saveState();
      return json(res,200,{ok:true,message:'Publication threshold and People’s Grade bands saved and applied to results.'});
    }
    if (req.method === 'POST' && pathname === '/api/admin/results-accounts') {
      const actor = requireRole(req, res, ['admin']); if (!actor) return;
      const data = await readBody(req); const email = clean(data.email, 254).toLowerCase();
      if (!validEmail(email) || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 200) return json(res, 400, { error: 'Enter a valid email and a password of at least 12 characters.' });
      if (state.users.some(u => u.email === email)) return json(res, 409, { error: 'An account already uses this email.' });
      const newAccount = await makeUser(email, data.password, 'results'); state.users.push(newAccount); state.audit.push({ action: 'results_account_created', actor: actor.id, subject: newAccount.id, at: new Date().toISOString() }); saveState();
      return json(res, 201, { message: 'Results account created. Share the login details directly with that person.' });
    }
    const reviewMatch = pathname.match(/^\/api\/admin\/ratings\/([a-f0-9]+)$/);
    if (req.method === 'PATCH' && reviewMatch) {
      const actor = requireRole(req, res, ['admin']); if (!actor) return;
      const data = await readBody(req); const rating = state.ratings.find(r => r.id === reviewMatch[1]);
      if (!rating) return json(res, 404, { error: 'Submission not found.' });
      if (data.commentStatus !== undefined) {
        if (!['private_pending_review', 'approved_for_comment', 'rejected'].includes(data.commentStatus)) return json(res, 400, { error: 'Choose a valid comment status.' });
        rating.commentStatus = data.commentStatus;
      }
      if (data.ratingStatus !== undefined) {
        if (!['counted', 'excluded'].includes(data.ratingStatus)) return json(res, 400, { error: 'Choose whether to count or exclude this rating.' });
        if (data.ratingStatus === 'counted' && (rating.identityStatus !== 'verified' || !rating.voterHash)) return json(res, 409, { error: 'An unverified rating cannot be counted.' });
        rating.counted = data.ratingStatus === 'counted'; rating.voteStatus = data.ratingStatus;
      }
      if (data.commentStatus === undefined && data.ratingStatus === undefined) return json(res, 400, { error: 'Choose a review change.' });
      rating.reviewedBy = actor.id; rating.reviewedAt = new Date().toISOString();
      state.audit.push({ action: data.ratingStatus ? `rating_${data.ratingStatus}` : `comment_${data.commentStatus}`, actor: actor.id, subject: rating.id, at: rating.reviewedAt }); saveState();
      return json(res, 200, { ok: true, message: data.ratingStatus === 'counted' ? 'Rating included in the shared aggregate. Results update when the published threshold is met.' : data.ratingStatus === 'excluded' ? 'Rating excluded from results. The resident can see the updated status in their account.' : 'Comment review saved. Approval does not publish the comment or change the vote count by itself.' });
    }
    if (req.method === 'POST' && pathname === '/api/admin/reports') {
      const actor = requireRole(req, res, ['admin']); if (!actor) return;
      const data = await readBody(req);
      const type = clean(data.type, 30), office = clean(data.office, 30), leader = clean(data.leader, 120);
      const title = clean(data.title, 180), detail = clean(data.detail, 1200), sourceLabel = clean(data.sourceLabel, 180);
      const sourceUrl = clean(data.sourceUrl, 500), evidenceClass = clean(data.evidenceClass, 30), status = clean(data.status, 20);
      const county = clean(data.county, 80), area = clean(data.area, 120), financialYear = clean(data.financialYear, 7);
      const fundType=clean(data.fundType,40),fundName=clean(data.fundName,120),contractor=clean(data.contractor,180);
      const sourceLocator=clean(data.sourceLocator,100),managementResponse=clean(data.managementResponse,800),queryStatus=clean(data.queryStatus,20);
      if (!['money', 'audit_finding', 'project', 'promise', 'leader_reply'].includes(type)) return json(res, 400, { error: 'Choose a valid report type.' });
      if (!offices.includes(office) || !leader || !title || !detail || !county) return json(res, 400, { error: 'Choose an office and provide the county, leader, title and details.' });
      if (financialYear && !/^\d{4}\/\d{2}$/.test(financialYear)) return json(res, 400, { error: 'Financial year must use the format YYYY/YY.' });
      if (!['reported', 'official_source'].includes(evidenceClass)) return json(res, 400, { error: 'Evidence must be labelled reported or official source. Professional verification is not connected.' });
      if (!['draft', 'published'].includes(status)) return json(res, 400, { error: 'Choose draft or published.' });
      const amountTypes = ['allocation', 'approved_project_budget', 'received', 'completed_spend', 'ongoing_spend', 'carry_forward', 'audit_query', 'contract_value'];
      const amountType = clean(data.amountType, 30);
      const amountValue = data.amountValue === '' || data.amountValue === undefined ? null : Number(data.amountValue);
      if (amountValue !== null && (!Number.isFinite(amountValue) || amountValue < 0 || amountValue > 1e15 || !amountTypes.includes(amountType))) return json(res, 400, { error: 'Enter a valid KSh amount and amount type.' });
      const auditCategories = ['unsupported_spending', 'stalled_or_abandoned', 'completed_but_unused', 'other_official_finding'];
      const auditCategory = clean(data.auditCategory, 40);
      if (auditCategory && !auditCategories.includes(auditCategory)) return json(res, 400, { error: 'Choose an Auditor-General category.' });
      if (type === 'audit_finding' && !auditCategory) return json(res, 400, { error: 'Select the Auditor-General’s published category for an audit finding.' });
      if (queryStatus && !['open','resolved'].includes(queryStatus)) return json(res, 400, { error: 'Audit query status must be open or resolved.' });
      const fundTypes=['county_budget','constituency_fund','ng_cdf','ward_allocation','other_fund'];
      if(fundType&&!fundTypes.includes(fundType))return json(res,400,{error:'Choose a supported fund type.'});
      if(type==='money'&&(!fundType||!fundName))return json(res,400,{error:'Money records must identify the generic fund type and fund name.'});
      const projectStatuses = ['not_reported', 'ongoing', 'complete_on_paper', 'stalled', 'abandoned', 'completed_but_unused'];
      const projectStatus = clean(data.projectStatus, 40), groundStatus = clean(data.groundStatus, 40);
      if (projectStatus && !projectStatuses.includes(projectStatus)) return json(res, 400, { error: 'Choose a valid project status.' });
      if (groundStatus && !projectStatuses.includes(groundStatus)) return json(res, 400, { error: 'Choose a valid ground status.' });
      const promiseStatuses = ['delivered', 'in_progress', 'not_started', 'broken', 'not_assessed'];
      const promiseStatus = clean(data.promiseStatus, 30);
      if (promiseStatus && !promiseStatuses.includes(promiseStatus)) return json(res, 400, { error: 'Choose a valid promise status.' });
      const reportPage = clean(data.reportPage, 12);
      if (reportPage && !/^\d{1,6}$/.test(reportPage)) return json(res, 400, { error: 'Report page must be a page number.' });
      const latitude=data.latitude===''||data.latitude===undefined?null:Number(data.latitude),longitude=data.longitude===''||data.longitude===undefined?null:Number(data.longitude);
      if((latitude===null)!==(longitude===null)||latitude!==null&&(!Number.isFinite(latitude)||latitude < -5.5||latitude>5.5||!Number.isFinite(longitude)||longitude<33.5||longitude>42.5))return json(res,400,{error:'Enter a valid Kenya map point with both latitude and longitude.'});
      if (status === 'published') {
        let source;
        try { source = new URL(sourceUrl); } catch { return json(res, 400, { error: 'A valid source link is required before publication.' }); }
        if (source.protocol !== 'https:' || !sourceLabel || data.sourceReviewed!==true || data.termsCleared!==true) return json(res, 400, { error: 'Publishing requires an HTTPS source, source name, human review and cleared usage terms.' });
        if(amountValue!==null&&!sourceLocator)return json(res,400,{error:'Every published number needs its source page, table or section.'});
        if(type==='audit_finding'&&(!reportPage||!queryStatus))return json(res,400,{error:'Every published audit finding needs its report page and open/resolved status.'});
      }
      const report = { id: randomBytes(12).toString('hex'), type, office, leader, county, area, financialYear, fundType, fundName, contractor, latitude, longitude, title, detail, amountType: amountType || '', amountValue, currency: 'KES', auditCategory, managementResponse, queryStatus, projectStatus, groundStatus, promiseStatus, reportPage, sourceLocator, evidenceClass, sourceLabel, sourceUrl, sourceReviewed:data.sourceReviewed===true, termsCleared:data.termsCleared===true, status, createdBy: actor.id, createdAt: new Date().toISOString(), publishedAt: status === 'published' ? new Date().toISOString() : null };
      state.reports.push(report); state.audit.push({ action: `report_${status}`, actor: actor.id, subject: report.id, at: report.createdAt }); saveState();
      return json(res, 201, { ok: true, message: status === 'published' ? 'Published to the shared results portal.' : 'Draft saved. It is visible only to admins.' });
    }
    const reportMatch = pathname.match(/^\/api\/admin\/reports\/([a-f0-9]+)$/);
    if (req.method === 'PATCH' && reportMatch) {
      const actor = requireRole(req, res, ['admin']); if (!actor) return;
      const data = await readBody(req); const report = state.reports.find(r => r.id === reportMatch[1]);
      if (!report) return json(res, 404, { error: 'Report record not found.' });
      if(data.action==='edit_summary'){
        const title=clean(data.title,180),detail=clean(data.detail,1200);if(!title||!detail)return json(res,400,{error:'A title and source summary are required.'});
        const before={title:report.title,detail:report.detail,status:report.status};report.title=title;report.detail=detail;
        if(report.status==='published'){report.status='draft';report.publishedAt=null;}
        const at=new Date().toISOString();state.audit.push({action:'report_corrected',actor:actor.id,subject:report.id,before,after:{title,detail},at});saveState();
        return json(res,200,{ok:true,message:before.status==='published'?'Correction saved as a draft. Review its source and republish the corrected entry.':'Draft correction saved.'});
      }
      if (!['draft', 'published'].includes(data.status)) return json(res, 400, { error: 'Choose draft or published.' });
      const sourceReviewed = data.sourceReviewed === true || report.sourceReviewed === true;
      const termsCleared = data.termsCleared === true || report.termsCleared === true;
      if (data.status === 'published') {
        let source;
        try { source = new URL(report.sourceUrl); } catch { return json(res, 400, { error: 'A source link is required before publication.' }); }
        if (source.protocol !== 'https:' || !report.sourceLabel || !sourceReviewed || !termsCleared) return json(res, 400, { error: 'Publishing requires the reviewer to confirm the source details and clear its usage terms.' });
        if(report.amountValue!==null&&!report.sourceLocator)return json(res,400,{error:'Every published number needs a source page, table or section.'});
        if(report.type==='audit_finding'&&(!report.reportPage||!report.queryStatus))return json(res,400,{error:'Audit findings need a report page and open/resolved status.'});
      }
      report.sourceReviewed = sourceReviewed; report.termsCleared = termsCleared;
      report.status = data.status; report.publishedAt = data.status === 'published' ? new Date().toISOString() : null;
      state.audit.push({ action: `report_${data.status}`, actor: actor.id, subject: report.id, at: new Date().toISOString() }); saveState();
      return json(res, 200, { ok: true, message: data.status === 'published' ? 'Published to shared results.' : 'Removed from shared results and saved as a draft.' });
    }
    if (req.method === 'GET' && pathname === '/api/admin/export.csv') {
      const user = requireRole(req, res, ['admin']); if (!user) return;
      const fields = ['type','county','financialYear','office','leader','area','fundType','fundName','title','detail','contractor','latitude','longitude','amountType','amountValue','currency','auditCategory','managementResponse','queryStatus','projectStatus','groundStatus','promiseStatus','reportPage','sourceLocator','evidenceClass','sourceLabel','sourceUrl','publishedAt'];
      const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
      const records = state.reports.filter(r => r.status === 'published' && r.sourceUrl);
      const csv = [fields.join(','), ...records.map(r => fields.map(key => cell(r[key])).join(','))].join('\r\n');
      res.writeHead(200, { 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="cheki-kiongozi-public-records.csv"', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY' });
      res.end(csv); return;
    }
    if (req.method === 'GET' && pathname === '/api/admin/backup.json') {
      const user = requireRole(req, res, ['admin']); if (!user) return;
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="cheki-kiongozi-private-backup.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});
      res.end(JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),state})); return;
    }
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });
    return send(res, 404, 'Not found');
  } catch (error) {
    console.error('Request error:', error.message);
    if (!res.headersSent) json(res, 400, { error: error.message || 'Request could not be completed.' });
    else res.end();
  }
});

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
if (process.env.MVP_DEMO_MODE === 'true' && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('MVP_DEMO_MODE is only allowed on localhost.');
if (process.env.MVP_DEMO_MODE === 'true' && process.env.NODE_ENV === 'production') throw new Error('MVP_DEMO_MODE cannot run with NODE_ENV=production.');
server.listen(port, host, () => {
  console.log(`Cheki Kiongozi running at http://${host}:${port}`);
  if (!state.users.some(u => u.role === 'admin')) console.log(`Create the first administrator at http://${host}:${port}/setup?token=${setupToken}`);
});
