fetch('/api/method').then(response=>response.json()).then(data=>{
  const status=document.getElementById('peopleMethodStatus');status.textContent=`Active financial year ${data.financialYear} · 1 to 10 · latest submission counts`;
  const table=document.getElementById('thresholdTable');table.replaceChildren();
  for(const office of data.offices){const row=document.createElement('article');row.className='result-row';const title=document.createElement('h3');title.textContent=office;const value=document.createElement('span');value.className='tag '+(data.thresholds[office]?'green':'gold');value.textContent=data.thresholds[office]?`${data.thresholds[office]} verified voters`:'Not configured';row.append(title,value);table.append(row);}
  const bands=document.getElementById('letterBands');if(data.letterBands){bands.textContent=`A ≥ ${data.letterBands.A}; B ≥ ${data.letterBands.B}; C ≥ ${data.letterBands.C}; D ≥ ${data.letterBands.D}; E below D`;}else bands.textContent='Bands not configured';
}).catch(()=>{document.getElementById('thresholdTable').textContent='Method settings could not load.';});
