// ─── Theme ───────────────────────────────────────────────────
(function () {
  const saved = sessionStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

// ─── Navigation ──────────────────────────────────────────────
const pageTitles = {
  dashboard:    'Dashboard',
  finansije:    'Finansije',
  cashflow:     'Cash Flow',
  izvestaji:    'Izveštaji',
  kreative:     'Kreative',
  skaliranje:   'Skaliranje',
  akcije:       'Istorija akcija',
  proizvodi:    'Proizvodi',
  narudzbine:   'Narudžbine',
  isporuceni:   'Isporučeni',
  bex:          'BEX Poštarina',
  povrati:      'Povrati',
  licne:        'Lične finansije',
  podesavanja:  'Podešavanja'
};

function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);

  if (page) page.classList.add('active');
  if (navItem) navItem.classList.add('active');

  const title = document.getElementById('pageTitle');
  if (title) title.textContent = pageTitles[pageId] || pageId;

  if (pageId === 'dashboard') loadDashboard();
  if (pageId === 'podesavanja') loadSettings();
  if (pageId === 'finansije') loadFinansije();
  if (pageId === 'narudzbine') loadNarudzbine();
  if (pageId === 'proizvodi') loadProizvodi();
  if (pageId === 'kreative') { if (window.loadKreative) loadKreative(); }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.page));
});

// ─── Theme Toggle ────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');
const themeLabel  = document.getElementById('themeLabel');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  sessionStorage.setItem('theme', theme);
  if (theme === 'dark') {
    themeIcon.textContent = '☀️';
    themeLabel.textContent = 'Light';
  } else {
    themeIcon.textContent = '🌙';
    themeLabel.textContent = 'Dark';
  }
}

themeToggle?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

// ─── Logout ──────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ─── Store Dropdown ──────────────────────────────────────────
let allStores = [];
let currentStoreId = 'all';

async function loadStoreDropdown() {
  try {
    const res = await fetch('/api/stores');
    const data = await res.json();
    allStores = data.stores || [];

    const sel = document.getElementById('storeSelect');
    if (!sel) return;

    sel.innerHTML = '<option value="all">Sve prodavnice</option>';
    allStores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });

    if (allStores.length === 1) {
      sel.value = allStores[0].id;
      currentStoreId = allStores[0].id;
    }
  } catch (e) {
    console.error('Greška pri učitavanju prodavnica', e);
  }
}

document.getElementById('storeSelect')?.addEventListener('change', (e) => {
  currentStoreId = e.target.value;
  const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (activePage) navigate(activePage);
});

// ─── Toast ───────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}
window.showToast = showToast;

// ─── Helpers ─────────────────────────────────────────────────
function fmtRSD(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(dec);
}
function fmtPct(n) { return n == null ? '—' : fmtNum(n, 1) + '%'; }

window.fmtRSD = fmtRSD;
window.fmtNum = fmtNum;
window.fmtPct = fmtPct;

// ─── Page stubs ───────────────────────────────────────────────
window.loadDashboard  = window.loadDashboard  || function(){};
window.loadFinansije  = window.loadFinansije  || function(){};
window.loadNarudzbine = window.loadNarudzbine || function(){};
window.loadProizvodi  = window.loadProizvodi  || function(){};
window.loadKreative   = window.loadKreative   || function(){};

// ─── Init ────────────────────────────────────────────────────
(async function init() {
  await loadStoreDropdown();
  navigate('dashboard');
})();