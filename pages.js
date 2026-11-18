const toastNode = document.getElementById('toast');
let toastTimer;
function showToast(message) {
  if (!toastNode) return;
  toastNode.textContent = message;
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2400);
}

document.querySelectorAll('.rating-row').forEach(row => {
  const field = row.dataset.name;
  for (let value = 1; value <= 5; value++) {
    const label = document.createElement('label');
    label.className = 'rate-option';
    label.innerHTML = `<input type="radio" name="${field}" value="${value}" aria-label="${value} out of 5"><span>${value}</span>`;
    row.append(label);
  }
});

const voteForm = document.getElementById('voteForm');
const gradeForm = document.getElementById('gradeForm');
const progressBars = document.querySelectorAll('.progress i');
document.getElementById('nextStep')?.addEventListener('click', () => {
  if (!voteForm.reportValidity()) return;
  voteForm.hidden = true;
  gradeForm.hidden = false;
  progressBars[1]?.classList.add('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('backStep')?.addEventListener('click', () => {
  gradeForm.hidden = true;
  voteForm.hidden = false;
  progressBars[1]?.classList.remove('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
gradeForm?.addEventListener('submit', event => {
  event.preventDefault();
  document.getElementById('doneModal')?.classList.add('open');
});

document.querySelectorAll('.admin-tabs button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    let visible = 0;
    document.querySelectorAll('.queue-row').forEach(row => {
      const show = filter === 'all' || row.dataset.kind === filter;
      row.hidden = !show;
      if (show) visible++;
    });
    const empty = document.getElementById('emptyQueue');
    if (empty) empty.hidden = visible !== 0;
  });
});
document.querySelectorAll('.queue-actions button').forEach(button => {
  button.addEventListener('click', () => {
    const row = button.closest('.queue-row');
    if (!row) return;
    row.querySelector('.tag').textContent = `${button.textContent.trim()} · Demo action`;
    row.querySelector('.tag').className = 'tag';
    row.querySelector('.queue-actions').innerHTML = '<span class="tag">Handled in demo</span>';
    const count = document.getElementById('pendingCount');
    if (count) count.textContent = Math.max(0, Number(count.textContent) - 1);
    showToast('Demo action only — no record was saved');
  });
});

document.getElementById('printCard')?.addEventListener('click', () => window.print());
