const counties = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu', 'Kiambu'];
const select = document.getElementById('countySelect');
const toast = document.getElementById('toast');
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

select.addEventListener('click', () => {
  const current = counties.indexOf(document.getElementById('countyName').textContent.replace(' County', ''));
  const next = counties[(current + 1) % counties.length];
  document.getElementById('countyName').textContent = `${next} County`;
  document.getElementById('crumbCounty').textContent = `${next} County`;
  document.getElementById('overviewCounty').textContent = `${next} County`;
  document.getElementById('introCounty').textContent = `${next} County`;
  document.getElementById('countyInitial').textContent = next[0];
  notify(`Showing the ${next} County prototype view`);
});

document.getElementById('shareButton').addEventListener('click', async () => {
  const shareData = { title: 'Cheki Kiongozi', text: 'Explore the Cheki Kiongozi prototype.', url: location.href };
  try {
    if (navigator.share) await navigator.share(shareData);
    else if (navigator.clipboard) {
      await navigator.clipboard.writeText(location.href);
      notify('Scorecard link copied');
    } else notify('Copy this page link to share the scorecard');
  } catch (error) {
    if (error.name !== 'AbortError') notify('Copy this page link to share the scorecard');
  }
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.querySelectorAll('.main-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.main-nav a').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
  });
});

document.querySelectorAll('.nav-link[href="#leaders"], .text-link[href="#leaders"]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.currentTarget.classList.contains('text-link')) {
      event.preventDefault();
      notify('Leader profiles are being prepared for this county');
    }
  });
});
