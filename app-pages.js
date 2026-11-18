function setMessage(element, text, type = 'success') {
  if (!element) return;
  element.className = `auth-message ${type}`;
  element.textContent = String(text ?? '');
}
function labelForType(type) {
  return ({money:'Money trail',audit_finding:'Audit finding',project:'Project',promise:'Campaign promise',leader_reply:'Leader reply'})[type] || 'Public record';
}
function addRatingControls() {
  document.querySelectorAll('.rating-row').forEach(row => {
    for (let value=1; value<=10; value++) {
      const label=document.createElement('label'); label.className='rate-option';
      const input=document.createElement('input'); input.type='radio'; input.name=row.dataset.name; input.value=String(value); input.setAttribute('aria-label',`${value} out of 10`);
      const span=document.createElement('span'); span.textContent=String(value); label.append(input,span); row.append(label);
    }
  });
}

// Accountless voter verification and rating submission.
const residentForm=document.getElementById('residentRatingForm');
if(residentForm)(async()=>{
  const badge=document.getElementById('identityBadge'),accountStatus=document.getElementById('accountIdentityStatus');
  const panel=document.getElementById('verificationPanel'),ratingPanel=document.getElementById('ratingPanel');
  const idForm=document.getElementById('idVerificationForm'),otpForm=document.getElementById('otpVerificationForm');
  const unavailable=document.getElementById('verificationUnavailable');
  let config={enabled:false,identityStatus:"not_verified"};
  try{const response=await fetch('/api/voter/session',{credentials:'same-origin'});if(response.ok)config=await response.json();}catch{}
  if(config.identityStatus==='verified'){
    badge.textContent='Verified voter';badge.className='tag green';accountStatus.textContent='Identity verified';accountStatus.className='tag green';
    panel.querySelector('.subtle').textContent='Your ID match is confirmed by the configured verification provider. No voter account is created; the site keeps only a keyed hash to prevent repeat votes.';
    unavailable.hidden=true;idForm.hidden=true;otpForm.hidden=true;ratingPanel.hidden=false;
  }else{
    badge.textContent='Check ID to continue';accountStatus.textContent='No account needed';ratingPanel.hidden=true;
    if(config.enabled){unavailable.hidden=true;idForm.hidden=false;
      if(config.demo){panel.querySelector('.subtle').textContent='DEMO MODE ONLY: enter any test ID (6–12 digits) and phone, then use the displayed demo code. This does not check a real person or contact a phone network.';document.getElementById('verificationUnavailable').hidden=false;document.getElementById('verificationUnavailable').textContent='DEMO MODE — test data only. Never enter a real national ID or phone number.';}
      else document.getElementById('verificationConsent').textContent=`I agree to send my ID and registered phone to ${config.providerName} for voter eligibility checking. Cheki Kiongozi will not store those raw numbers.`;
      if(config.privacyUrl){const link=document.createElement('a');link.href=config.privacyUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=` ${config.providerName} privacy information`;document.getElementById('providerPrivacy').replaceChildren(link);}
    }else{unavailable.hidden=false;idForm.hidden=true;otpForm.hidden=true;}
  }
  idForm.addEventListener('submit',async event=>{
    event.preventDefault();const values=Object.fromEntries(new FormData(idForm));values.consent=values.consent==='on';
    const button=idForm.querySelector('button[type="submit"]');button.disabled=true;
    let response,result;try{response=await fetch('/api/voter/verification/start',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(values)});result=await response.json();}catch{result={error:'Could not reach the verification provider.'};}
    button.disabled=false;if(!response?.ok){setMessage(document.getElementById('verificationMessage'),result.error,'error');return;}
    idForm.reset();idForm.hidden=true;otpForm.hidden=false;document.getElementById('challengeId').value=result.challengeId;setMessage(document.getElementById('otpMessage'),result.message);document.getElementById('otpCode').focus();
  });
  otpForm.addEventListener('submit',async event=>{
    event.preventDefault();const values=Object.fromEntries(new FormData(otpForm));let response,result;
    try{response=await fetch('/api/voter/verification/complete',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(values)});result=await response.json();}catch{result={error:'Could not reach the verification provider.'};}
    if(!response?.ok){setMessage(document.getElementById('otpMessage'),result.error,'error');return;}
    badge.textContent='Verified voter';badge.className='tag green';accountStatus.textContent='Identity verified';accountStatus.className='tag green';otpForm.reset();otpForm.hidden=true;ratingPanel.hidden=false;
    panel.querySelector('.subtle').textContent='Your ID match is confirmed. No voter account was created; only a keyed hash is used to prevent repeat votes.';setMessage(document.getElementById('ratingMessage'),result.message);
  });
  addRatingControls();
  residentForm.addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(residentForm),scores={};
    for(const key of ['roads','water','health','education','jobs','corruption','availability']){const value=form.get(key);if(value)scores[key]=Number(value);}
    let response,result;try{response=await fetch('/api/ratings',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({office:form.get('office'),leader:form.get('leader'),county:form.get('county'),constituency:form.get('constituency'),ward:form.get('ward'),scores,comment:form.get('comment')})});result=await response.json();}catch{result={error:'Could not save your rating.'};}
    setMessage(document.getElementById('ratingMessage'),result.message||result.error,response?.ok?'success':'error');if(response?.ok){residentForm.reset();await loadMyRatings();}
  });
  await loadMyRatings();setInterval(loadMyRatings,15000);
})();
async function loadMyRatings(){
  const target=document.getElementById('myRatings');if(!target)return;
  const response=await fetch('/api/voter/ratings',{credentials:'same-origin'});if(!response.ok){target.textContent='Verify your ID to see ratings submitted from this browser.';return;}
  const data=await response.json(),ratings=data.ratings;if(!ratings.length){target.textContent=`No grades submitted for FY ${data.financialYear} yet.`;return;}target.replaceChildren();
  for(const rating of ratings){const row=document.createElement('div');row.className='queue-row';const info=document.createElement('div');const title=document.createElement('h3');title.textContent=`${rating.office} · ${rating.leader} · FY ${rating.fy}`;const area=document.createElement('p');area.textContent=`${rating.area} · last updated ${new Date(rating.updatedAt||rating.createdAt).toLocaleDateString()}`;const badge=document.createElement('span');badge.className=`tag ${rating.voteStatus==='counted'?'green':rating.voteStatus==='excluded'?'red':'gold'}`;badge.textContent=rating.voteStatus==='counted'?'Included in reviewed totals':rating.voteStatus==='excluded'?'Excluded after review':'Waiting for admin review';info.append(title,area,badge);if(rating.fy===data.financialYear){const note=document.createElement('p');note.textContent=`You can update this grade until ${data.cycleCloses}. Your latest submission counts.`;info.append(note);}row.append(info);target.append(row);}
}

// Admin dashboard: review, collect source records and curate Super Data.
let dataFilterEventsAdded=false,methodSettingsLoaded=false;
if(document.getElementById('reviewQueueList'))(async()=>{const user=await requireClientRole(['admin']);if(!user)return;await loadAdminOverview();setInterval(loadAdminOverview,15000);})();
async function loadAdminOverview(){
  const response=await fetch('/api/admin/overview',{credentials:'same-origin'});if(!response.ok)return;const data=await response.json();
  const modeNotice=document.getElementById('runtimeModeNotice');if(modeNotice)modeNotice.hidden=!data.demoMode;
  if(!methodSettingsLoaded&&data.settings){const form=document.getElementById('methodSettingsForm');if(form){const thresholds=Object.values(data.settings.thresholds||{}).filter(Number.isFinite);if(thresholds.length)form.elements.minimumVotes.value=thresholds[0];for(const key of ['A','B','C','D'])if(Number.isFinite(data.settings.bands?.[key]))form.elements[`grade${key}`].value=data.settings.bands[key];}methodSettingsLoaded=true;}
  document.getElementById('submissionCount').textContent=String(data.ratings.length);
  document.getElementById('pendingComments').textContent=String(data.ratings.filter(r=>r.comment&&r.commentStatus==='private_pending_review').length);
  document.getElementById('publicRecordCount').textContent=String(data.reports.filter(record=>record.status==='published').length);
  const queue=document.getElementById('reviewQueueList');queue.replaceChildren();
  const pending=data.ratings.filter(r=>r.identityStatus==='verified'&&r.voteStatus==='pending_review');
  const comments=data.ratings.filter(r=>r.comment&&r.commentStatus==='private_pending_review');
  if(!pending.length&&!comments.length)queue.textContent='No ratings or comments are waiting for review.';
  for(const rating of new Map([...pending,...comments].map(r=>[r.id,r])).values()){
    const row=document.createElement('article');row.className='queue-row';const info=document.createElement('div');const badge=document.createElement('span');badge.className=`tag ${rating.identityStatus==='verified'?'green':'gold'}`;badge.textContent=rating.identityStatus==='verified'?'Verified voter · private':'Identity not verified · private';
    const title=document.createElement('h3');title.style.marginTop='8px';title.textContent=`${rating.office} · ${rating.leader} · ${rating.area}`;const detail=document.createElement('p');detail.textContent=Object.entries(rating.scores).map(([key,value])=>`${key}: ${value}/10`).join(' · ');const comment=document.createElement('p');comment.textContent=rating.comment||'No comment submitted.';info.append(badge,title,detail,comment);
    const actions=document.createElement('div');actions.className='queue-actions';
    if(rating.identityStatus==='verified'&&rating.voteStatus==='pending_review')for(const [label,ratingStatus]of[['Count after review','counted'],['Exclude','excluded']]){const button=document.createElement('button');button.textContent=label;if(ratingStatus==='counted')button.className='approve';button.addEventListener('click',()=>updateRating(rating.id,{ratingStatus},row));actions.append(button);}
    if(rating.comment&&rating.commentStatus==='private_pending_review')for(const [label,commentStatus]of[['Approve comment','approved_for_comment'],['Reject comment','rejected']]){const button=document.createElement('button');button.textContent=label;button.addEventListener('click',()=>updateRating(rating.id,{commentStatus},row));actions.append(button);}
    row.append(info,actions);queue.append(row);
  }
  setupSuperData(data.reports||[]);
}
async function updateRating(id,change,row){const response=await fetch(`/api/admin/ratings/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(change)});const data=await response.json();setMessage(document.getElementById('reviewMessage'),data.message||data.error,response.ok?'success':'error');if(response.ok){row.remove();setTimeout(loadAdminOverview,250);}}

function setupSuperData(reports){
  const published=reports.filter(r=>r.status==='published');const counties=[...new Set(reports.map(r=>r.county).filter(Boolean))].sort();
  document.getElementById('dataTotal').textContent=String(reports.length);document.getElementById('dataPublished').textContent=String(published.length);document.getElementById('dataCounties').textContent=String(counties.length);
  for(const [id,values,label] of [['dataCounty',counties,'All counties'],['dataYear',[...new Set(reports.map(r=>r.financialYear).filter(Boolean))].sort(),'All financial years']]){
    const select=document.getElementById(id);const current=select.value;select.replaceChildren(new Option(label,''));for(const value of values)select.add(new Option(value,value));select.value=current;
  }
  if(!dataFilterEventsAdded){for(const id of ['dataCounty','dataYear','dataType','dataOffice'])document.getElementById(id)?.addEventListener('change',()=>renderAdminReports(window.adminReports||[]));document.getElementById('exportData')?.addEventListener('click',exportPublicData);dataFilterEventsAdded=true;}
  window.adminReports=reports;renderAdminReports(reports);
}
function renderAdminReports(reports){
  const county=document.getElementById('dataCounty')?.value||'',year=document.getElementById('dataYear')?.value||'',type=document.getElementById('dataType')?.value||'',office=document.getElementById('dataOffice')?.value||'';
  const filtered=reports.filter(r=>(!county||r.county===county)&&(!year||r.financialYear===year)&&(!type||r.type===type)&&(!office||r.office===office));
  const counts=new Map();for(const record of filtered)counts.set(labelForType(record.type),(counts.get(labelForType(record.type))||0)+1);
  const summary=document.getElementById('superDataSummary');summary.textContent=filtered.length?`${filtered.length} matching records · ${filtered.filter(r=>r.evidenceClass==='official_source').length} official-source records · ${[...counts].map(([name,count])=>`${name}: ${count}`).join(' · ')}`:'No records match these filters. Add sourced records in Data Collection.';
  const target=document.getElementById('adminReports');target.replaceChildren();if(!filtered.length){target.textContent='No records in this view.';return;}
  for(const report of filtered){const row=document.createElement('article');row.className='queue-row';const info=document.createElement('div');const title=document.createElement('h3');title.textContent=`${report.title} · ${report.office} · ${report.county}`;const detail=document.createElement('p');detail.textContent=[report.financialYear,report.area,labelForType(report.type),report.status==='published'?'Published':'Draft',report.evidenceClass==='official_source'?'Official source':'Reported',report.sourceLabel||'No source'].filter(Boolean).join(' · ');if(report.amountValue!==null&&report.amountValue!==undefined){const amount=document.createElement('p');amount.textContent=`${(report.amountType||'amount').replaceAll('_',' ')}: KSh ${Number(report.amountValue).toLocaleString()}`;info.append(title,detail,amount);}else info.append(title,detail);if(report.sourceUrl){const source=document.createElement('a');source.href=report.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.className='text-link';source.textContent=`Open source ${report.sourceLocator?`· ${report.sourceLocator} `:''}↗`;info.append(source);}let termsReviewed=false;if(report.status!=='published'){const confirm=document.createElement('label');confirm.style.display='block';confirm.style.marginTop='8px';const check=document.createElement('input');check.type='checkbox';check.style.width='auto';check.style.marginRight='7px';confirm.append(check,document.createTextNode('I checked the source details and cleared its reuse terms'));info.append(confirm);termsReviewed=check;}const actions=document.createElement('div');actions.className='queue-actions';const edit=document.createElement('button');edit.textContent='Correct title / summary';edit.addEventListener('click',()=>editReportSummary(report));const button=document.createElement('button');button.className=report.status==='published'?'':'approve';button.textContent=report.status==='published'?'Move to draft':'Publish';button.disabled=report.status!=='published';if(termsReviewed)termsReviewed.addEventListener('change',()=>{button.disabled=!termsReviewed.checked;});button.addEventListener('click',()=>changeReportStatus(report.id,report.status==='published'?'draft':'published',Boolean(termsReviewed?.checked)));actions.append(edit,button);row.append(info,actions);target.append(row);}
}
async function editReportSummary(report){const title=window.prompt('Correct the record title:',report.title);if(title===null)return;const detail=window.prompt('Correct the source summary:',report.detail);if(detail===null)return;const response=await fetch(`/api/admin/reports/${report.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'edit_summary',title,detail})});const data=await response.json();setMessage(document.getElementById('reportMessage'),data.message||data.error,response.ok?'success':'error');if(response.ok)loadAdminOverview();}
async function changeReportStatus(id,status,termsReviewed=false){const response=await fetch(`/api/admin/reports/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({status,sourceReviewed:termsReviewed,termsCleared:termsReviewed})});const data=await response.json();setMessage(document.getElementById('reportMessage'),data.message||data.error,response.ok?'success':'error');if(response.ok)loadAdminOverview();}
async function exportPublicData(){const response=await fetch('/api/admin/export.csv',{credentials:'same-origin'});if(!response.ok){setMessage(document.getElementById('reportMessage'),'Could not export the public dataset.','error');return;}const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='cheki-kiongozi-public-records.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
document.getElementById('methodSettingsForm')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await response.json();setMessage(document.getElementById('methodSettingsMessage'),data.message||data.error,response.ok?'success':'error');if(response.ok){methodSettingsLoaded=false;loadAdminOverview();}});
document.getElementById('sharedReportForm')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));values.sourceReviewed=form.elements.sourceReviewed.checked;values.termsCleared=form.elements.termsCleared.checked;let response,data;try{response=await fetch('/api/admin/reports',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(values)});data=await response.json();}catch{data={error:'Could not save this data record.'};}setMessage(document.getElementById('reportMessage'),data.message||data.error,response?.ok?'success':'error');if(response?.ok){form.reset();loadAdminOverview();}});

// Results account: receives only public aggregates and published source records.
if(document.getElementById('publishedVotes'))(async()=>{await loadResults();setInterval(loadResults,15000);})();
async function loadResults(){
  const response=await fetch('/api/results',{credentials:'same-origin'});if(!response.ok)return;const data=await response.json();
  const demoNotice=document.getElementById('resultsDemoNotice');if(demoNotice)demoNotice.hidden=!data.demoMode;
  document.getElementById('publishedVotes').textContent=String(data.publishedRatings);const reportCount=document.getElementById('publishedReports');if(reportCount)reportCount.textContent=String(data.reports.length);
  const counts=document.getElementById('eligibleLeaders');if(counts){counts.replaceChildren();if(!data.eligibleLeaders.length)counts.textContent=Object.values(data.thresholds||{}).some(Boolean)?'No leader group has reached its configured office threshold.':'No office thresholds are configured, so no counts or grades are public yet.';else for(const item of data.eligibleLeaders){const row=document.createElement('article');row.className='result-row';const role=document.createElement('div');role.className='role-dot';role.textContent=item.office==='MP'?'MP':item.office==='Woman Representative'?'WR':item.office[0];const label=document.createElement('div');const title=document.createElement('h3');title.textContent=`${item.office} · ${item.leader}`;const area=document.createElement('p');area.textContent=`${item.county} · ${item.area} · FY ${item.fy}`;label.append(title,area);const count=document.createElement('span');count.className='tag green';count.textContent=`People: ${item.letter?`${item.letter} · `:''}${item.score}/10 · ${item.voteCount} votes`;const link=document.createElement('a');link.href=`/scorecard?office=${encodeURIComponent(item.office)}&leader=${encodeURIComponent(item.leader)}&fy=${encodeURIComponent(item.fy)}`;link.textContent='Open card →';row.append(role,label,count,link);counts.append(row);}}
  renderPublicReports(data.reports||[]);
}
function renderPublicReports(reports,targetId='publicRecords',filterOffice='',filterLeader=''){
  const target=document.getElementById(targetId);if(!target)return;target.replaceChildren();let items=filterOffice?reports.filter(r=>r.office===filterOffice):reports;if(filterLeader)items=items.filter(r=>r.leader.toLowerCase()===filterLeader.toLowerCase());
  if(!items.length){target.textContent='No source-backed records have been published for this view yet.';return;}
  for(const report of items){const card=document.createElement('article');card.className='panelbox';const kicker=document.createElement('div');kicker.className='kicker';kicker.textContent=`${labelForType(report.type)} · ${report.office} · ${report.evidenceClass==='official_source'?'OFFICIAL SOURCE':'REPORTED'}`;const title=document.createElement('h3');title.className='section-title';title.textContent=report.title;const location=document.createElement('p');location.className='source-label';location.textContent=[report.county,report.area,report.financialYear].filter(Boolean).join(' · ');const detail=document.createElement('p');detail.className='subtle';detail.textContent=report.detail;card.append(kicker,title,location,detail);
    const metadata=[report.fundName&&`Fund: ${report.fundName}`,report.auditCategory&&`Audit: ${report.auditCategory.replaceAll('_',' ')}`,report.queryStatus&&`Query: ${report.queryStatus}`,report.managementResponse&&`Management response: ${report.managementResponse}`,report.projectStatus&&`Paper status: ${report.projectStatus.replaceAll('_',' ')}`,report.groundStatus&&`Ground record: ${report.groundStatus.replaceAll('_',' ')}`,report.contractor&&`Contractor: ${report.contractor}`,Number.isFinite(report.latitude)&&Number.isFinite(report.longitude)&&`Location: ${report.latitude}, ${report.longitude}`,report.promiseStatus&&`Promise: ${report.promiseStatus.replaceAll('_',' ')}`,report.reportPage&&`Report p. ${report.reportPage}`].filter(Boolean);
    if(report.amountValue!==null&&report.amountValue!==undefined){const amount=document.createElement('span');amount.className='tag';amount.textContent=`KSh ${Number(report.amountValue).toLocaleString()} · ${(report.amountType||'amount').replaceAll('_',' ')}`;card.append(amount);}
    if(metadata.length){const meta=document.createElement('p');meta.className='source-label';meta.textContent=metadata.join(' · ');card.append(meta);}
    if(report.sourceUrl){const link=document.createElement('a');link.href=report.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.className='text-link';link.textContent=`Source: ${report.sourceLabel}${report.sourceLocator?` · ${report.sourceLocator}`:''} ↗`;card.append(link);}target.append(card);}
}
if(document.getElementById('scorecard'))(async()=>{const office=new URLSearchParams(location.search).get('office')||'';const leader=new URLSearchParams(location.search).get('leader')||'';const fy=new URLSearchParams(location.search).get('fy')||'';if(office){document.getElementById('officeTitle').textContent=leader?`${office} · ${leader}`:`${office} scorecard`;document.title=`${office} scorecard · Cheki Kiongozi`;}async function refreshCard(){const response=await fetch('/api/results',{credentials:'same-origin'});if(!response.ok)return;const data=await response.json();renderPublicReports(data.reports||[],'publicRecords',office,leader);const match=data.eligibleLeaders.find(item=>item.office===office&&(!leader||item.leader.toLowerCase()===leader.toLowerCase())&&(!fy||item.fy===fy));const status=document.getElementById('scorecardVoteStatus');if(match){status.textContent=`FY ${match.fy}: ${match.score}/10 from ${match.voteCount} reviewed verified votes · July 1 ${match.fy.split("/")[0]}–June 30 ${Number(match.fy.split("/")[0])+1}${match.letter?` · People’s Grade ${match.letter}`:''}.`;const grade=document.getElementById('peopleGradeValue');if(grade)grade.textContent=match.letter||match.score.toFixed(1);document.getElementById('peopleGradeStatus').textContent=`${match.voteCount} votes · ${match.fy}`;const categories=document.getElementById('peopleCategories');if(categories){categories.replaceChildren();for(const [name,value]of Object.entries(match.categoryScores)){const item=document.createElement('li');const label=document.createElement('span');label.textContent=name;const score=document.createElement('b');score.textContent=`${value}/10`;item.append(label,score);categories.append(item);}}}else{const threshold=data.thresholds?.[office];status.textContent=threshold?`No rating group has reached the ${threshold}-voter threshold for this leader and year.`:'No threshold is configured for this office; no counts or grades are public.';}}await refreshCard();setInterval(refreshCard,15000);})();
document.getElementById('printCard')?.addEventListener('click',()=>window.print());
