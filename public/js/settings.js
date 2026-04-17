// Settings page logic
let stores = [];

async function loadSettings() {
  try {
    const res = await fetch('/api/settings/stores');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    stores = data.stores || [];
    renderStoreList();
  } catch(e) {
    showToast('Greška pri učitavanju prodavnica', 'error');
  }
}

function renderStoreList() {
  const container = document.getElementById('storeSettingsList');
  if (!container) return;

  if (!stores.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:13px;margin-bottom:16px;">Nema prodavnica. Dodaj prvu prodavnicu ispod.</p>';
    return;
  }

  container.innerHTML = stores.map(s => `
    <div class="settings-card" style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="status-dot ${s.shopify_token_status === 'connected' ? 'connected' : 'error'}"></div>
          <span style="font-weight:700;font-size:15px;">${s.name}</span>
          <span style="font-size:12px;color:var(--text3);">${s.shopify_url || '—'}</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px;" onclick="editStore(${s.id})">Izmeni</button>
          <button class="btn btn-danger" style="padding:5px 12px;font-size:12px;" onclick="deleteStore(${s.id})">Obriši</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div class="token-status ${s.shopify_token_status === 'connected' ? 'ok' : 'pending'}">
          🛍️ Shopify: ${s.shopify_token_status === 'connected' ? 'Povezano ✓' : 'Nije testirano'}
        </div>
        <div class="token-status ${s.meta_ad_account_id ? 'ok' : 'pending'}">
          📘 Meta: ${s.meta_ad_account_id ? 'Podešeno ✓' : 'Nije podešeno'}
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px;" onclick="testShopify(${s.id})">🔌 Testiraj Shopify</button>
        <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px;" onclick="refreshShopifyToken(${s.id})">🔄 Refresh token</button>
      </div>
    </div>
  `).join('');
}

function editStore(id) {
  const store = stores.find(s => s.id === id);
  if (!store) return;
  document.getElementById('storeFormTitle').textContent = 'Izmeni prodavnicu';
  document.getElementById('storeId').value = store.id;
  document.getElementById('storeName').value = store.name || '';
  document.getElementById('storeUrl').value = store.shopify_url || '';

  // Client ID je vidljiv — popuni ako postoji
  const clientIdEl = document.getElementById('storeClientId');
  clientIdEl.value = store.shopify_client_id || '';
  clientIdEl.type = 'text';
  clientIdEl.placeholder = store.shopify_client_id
    ? store.shopify_client_id
    : 'npr. 87101155ede889d77cb14e7d44f41188';

  // Client Secret — asteriksi, placeholder ako postoji
  const clientSecretEl = document.getElementById('storeClientSecret');
  clientSecretEl.value = '';
  clientSecretEl.type = 'password';
  clientSecretEl.placeholder = store.has_shopify_token ? '••••••••  (ostavite prazno da ne menjate)' : 'shpss_...';

  // Meta Token — asteriksi, placeholder ako postoji
  const metaTokenEl = document.getElementById('metaToken');
  metaTokenEl.value = '';
  metaTokenEl.type = 'password';
  metaTokenEl.placeholder = store.has_meta_token ? '••••••••  (ostavite prazno da ne menjate)' : 'EAAxxxxx...';

  // Meta Account ID — vidljiv
  const metaAccountEl = document.getElementById('metaAccountId');
  metaAccountEl.value = store.meta_ad_account_id || '';
  metaAccountEl.type = 'text';

  document.getElementById('storeFormCard').style.display = 'block';
  document.getElementById('storeFormCard').scrollIntoView({ behavior: 'smooth' });
}

window.newStore = function() {
  document.getElementById('storeFormTitle').textContent = 'Nova prodavnica';
  document.getElementById('storeId').value = '';
  document.getElementById('storeForm').reset();

  // Reset tipova polja i placeholdera za novu prodavnicu
  document.getElementById('storeClientId').type = 'text';
  document.getElementById('storeClientId').placeholder = 'npr. 87101155ede889d77cb14e7d44f41188';
  document.getElementById('storeClientSecret').type = 'password';
  document.getElementById('storeClientSecret').placeholder = 'shpss_...';
  document.getElementById('metaToken').type = 'password';
  document.getElementById('metaToken').placeholder = 'EAAxxxxx...';
  document.getElementById('metaAccountId').type = 'text';

  document.getElementById('storeFormCard').style.display = 'block';
  document.getElementById('storeFormCard').scrollIntoView({ behavior: 'smooth' });
};

window.cancelStoreForm = function() {
  document.getElementById('storeFormCard').style.display = 'none';
};

window.editStore = editStore;

window.deleteStore = async function(id) {
  if (!confirm('Obrisati prodavnicu?')) return;
  const res = await fetch(`/api/settings/stores/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) { showToast('Prodavnica obrisana', 'success'); loadSettings(); }
  else showToast(data.error || 'Greška', 'error');
};

window.testShopify = async function(id) {
  showToast('Testiram konekciju...', 'success');
  const res = await fetch(`/api/settings/stores/${id}/test-shopify`, { method: 'POST' });
  const data = await res.json();
  if (data.success) { showToast(`Shopify povezan: ${data.shop} ✓`, 'success'); loadSettings(); }
  else showToast(data.error || 'Konekcija neuspešna', 'error');
};

window.refreshShopifyToken = async function(id) {
  showToast('Osvežavam token...', 'success');
  const res = await fetch(`/api/settings/stores/${id}/refresh-token`, { method: 'POST' });
  const data = await res.json();
  if (data.success) showToast('Token osvežen ✓', 'success');
  else showToast(data.error || 'Refresh neuspešan', 'error');
};

// ─── Form submit ──────────────────────────────────────────────
function initSettingsForms() {
  const form = document.getElementById('storeForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const existingId   = document.getElementById('storeId').value;
    const clientId     = document.getElementById('storeClientId').value.trim();
    const clientSecret = document.getElementById('storeClientSecret').value.trim();
    const metaToken    = document.getElementById('metaToken').value.trim();

    const body = {
      id:                 existingId || null,
      name:               document.getElementById('storeName').value.trim(),
      shopify_url:        document.getElementById('storeUrl').value.trim().replace(/https?:\/\//, '').replace(/\/.*/, '').trim(),
      meta_ad_account_id: document.getElementById('metaAccountId').value.trim()
    };

    // Šalji SAMO ako je korisnik uneo nešto novo — inače ostavi stari u bazi
    if (clientId)     body.shopify_client_id     = clientId;
    if (clientSecret) body.shopify_client_secret  = clientSecret;
    if (metaToken)    body.meta_access_token      = metaToken;

    if (!body.name) { showToast('Unesite naziv prodavnice', 'error'); return; }

    const btn = form.querySelector('[type=submit]');
    btn.textContent = 'Čuvam...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/settings/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Sačuvano ✓', 'success');
        cancelStoreForm();
        loadSettings();
        if (typeof loadStoreDropdown === 'function') loadStoreDropdown();
      } else {
        showToast(data.error || 'Greška pri čuvanju', 'error');
      }
    } catch(err) {
      showToast('Mrežna greška', 'error');
    } finally {
      btn.textContent = 'Sačuvaj';
      btn.disabled = false;
    }
  });

  // Settings nav tabs
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const sec = document.getElementById('settings-' + item.dataset.section);
      if (sec) sec.classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', initSettingsForms);
if (document.readyState !== 'loading') initSettingsForms();
