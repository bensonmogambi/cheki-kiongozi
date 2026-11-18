const authForm = document.querySelector('[data-auth-form]');
const loginRouteNotice=document.getElementById('loginRouteNotice');
if(loginRouteNotice){const next=new URLSearchParams(location.search).get('next');if(next==='/results'||next?.startsWith('/scorecard')){loginRouteNotice.hidden=false;loginRouteNotice.innerHTML='<strong>Results workspace sign-in.</strong> Use a results-viewer account. If you do not have one, ask the Cheki Kiongozi administrator to create it.';}else if(next==='/admin'){loginRouteNotice.hidden=false;loginRouteNotice.textContent='Admin workspace sign-in. Use your administrator account.';}}
authForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(authForm);
  const payload = Object.fromEntries(formData.entries());
  if (authForm.dataset.authForm === 'login') payload.next = new URLSearchParams(location.search).get('next') || '';
  const message = document.querySelector('.auth-message');
  const submit = authForm.querySelector('button[type="submit"]');
  if (message) { message.className = 'auth-message'; message.textContent = ''; }
  if (submit) { submit.disabled = true; submit.textContent = 'Please wait…'; }
  try {
    if (authForm.dataset.authForm === 'setup') payload.setupToken = new URLSearchParams(location.search).get('token') || '';
    const endpoint = { login: '/api/login', register: '/api/register', setup: '/api/setup-admin' }[authForm.dataset.authForm];
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not complete this request.');
    if (message) { message.className = 'auth-message success'; message.textContent = authForm.dataset.authForm === 'register' ? 'Account created. Taking you to resident grading…' : 'Signed in. Opening your workspace…'; }
    location.assign(result.redirect || '/login');
  } catch (error) {
    if (message) { message.className = 'auth-message error'; message.textContent = error.message; }
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = authForm.dataset.label || 'Continue'; }
  }
});
document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  location.assign('/login');
}));

async function requireClientRole(roles) {
  const response = await fetch('/api/me', { credentials: 'same-origin' });
  if (!response.ok) { location.replace('/login'); return null; }
  const data = await response.json();
  if (!roles.includes(data.user.role)) { document.body.innerHTML = '<main class="auth-wrap"><section class="auth-card"><h1>That area is private</h1><p>This account does not have permission to view this page.</p><button class="btn" data-logout>Sign in with another account</button></section></main>'; document.querySelector('[data-logout]')?.addEventListener('click', async () => { await fetch('/api/logout',{method:'POST'}); location.assign('/login'); }); return null; }
  document.querySelectorAll('[data-account-email]').forEach(node => node.textContent = data.user.email);
  document.querySelectorAll('[data-account-area]').forEach(node => node.textContent = [data.user.ward, data.user.constituency, data.user.county].filter(Boolean).join(' · '));
  return data.user;
}
