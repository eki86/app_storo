window.proizvodiState = { products: [], activeTab: 'lista', editingProduct: null, period: 'today', dateFrom: '', dateTo: '' };

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPct(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
  return `${Number(val).toFixed(1).replace('.', ',')}%`;
}

function fmtCount(val) {
  return new Intl.NumberFormat('sr-RS').format(Number(val || 0));
}

function yesNoBadge(flag, yes = 'Uključen', no = 'Isključen') {
  return flag ? `<span class="badge badge-green">${yes}</span>` : `<span class="badge badge-gray">${no}</span>`;
}

function roasBadge(roas) {
  if (roas === null || roas === undefined) return `<span class="badge badge-gray">Nema mapping</span>`;
  if (roas >= 3) return `<span class="badge badge-green">${Number(roas).toFixed(2)}</span>`;
  if (roas >= 2) return `<span class="badge badge-yellow">${Number(roas).toFixed(2)}</span>`;
  return `<span class="badge badge-red">${Number(roas).toFixed(2)}</span>`;
}

function marginBadge(margin) {
  if (margin === null || margin === undefined) return `<span class="badge badge-gray">—</span>`;
  if (margin >= 20) return `<span class="badge badge-green">${fmtPct(margin)}</span>`;
  if (margin >= 0) return `<span class="badge badge-yellow">${fmtPct(margin)}</span>`;
  return `<span class="badge badge-red">${fmtPct(margin)}</span>`;
}

function statusBadge(status) {
  const map = { active: 'badge-green', archived: 'badge-gray', draft: 'badge-yellow' };
  return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || 'n/a')}</span>`;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getProizvodiParams() {
  const storeId = window.currentStoreId || 'all';
  return {
    storeId,
    period: window.proizvodiState.period || 'today',
    dateFrom: window.proizvodiState.dateFrom || '',
    dateTo: window.proizvodiState.dateTo || ''
  };
}

function buildProductsQuery() {
  const { storeId, period, dateFrom, dateTo } = getProizvodiParams();
  const params = new URLSearchParams({ store_id: storeId, period });
  if (period === 'custom' && dateFrom && dateTo) {
    params.set('date_from', dateFrom);
    params.set('date_to', dateTo);
  }
  return params.toString();
}

function renderProizvodiStats(products) {
  const wrap = document.getElementById('proizvodiStats');
  if (!wrap) return;
  const revenue = products.reduce((s, p) => s + Number(p.revenue || 0), 0);
  const profit = products.reduce((s, p) => s + Number(p.profit || 0), 0);
  const qty = products.reduce((s, p) => s + Number(p.qty || 0), 0);
  wrap.innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Proizvoda</div><div class="kpi-value">${fmtCount(products.length)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Prodato komada</div><div class="kpi-value">${fmtCount(qty)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Prihod</div><div class="kpi-value">${fmtRSD(revenue)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Profit bez Meta spenda</div><div class="kpi-value">${fmtRSD(profit)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Filter</div><div class="kpi-value">${window.proizvodiState.period === 'custom' ? 'Od - Do' : (window.proizvodiState.period === 'week' ? 'Nedelja' : window.proizvodiState.period === 'month' ? 'Mesec' : window.proizvodiState.period === 'yesterday' ? 'Juče' : 'Danas')}</div></div>
  `;
}

function renderProizvodiLista(products) {
  const tbody = document.getElementById('proizvodiListaTbody');
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--text3)">Nema proizvoda. Proveri Shopify konekciju ili osveži stranicu.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="cell-title" title="${esc(p.title)}">${esc(p.title)}</div>
        <div class="table-muted">${p.sku ? `SKU: ${esc(p.sku)}` : 'Bez SKU'}</div>
      </td>
      <td>${fmtCount(p.qty)}</td>
      <td>${p.shopify_price ? fmtRSD(p.shopify_price) : '<span class="badge badge-gray">—</span>'}</td>
      <td>${p.cost_rsd ? fmtRSD(p.cost_rsd) : '<span class="badge badge-red">Nije uneto</span>'}</td>
      <td>${fmtRSD(p.packaging_cost_rsd || 0)}</td>
      <td style="font-weight:600">${fmtRSD(p.cogs_total || 0)}</td>
      <td>${roasBadge(p.roas)}</td>
      <td style="font-weight:600">${fmtRSD(p.revenue || 0)}</td>
      <td>${p.recommended_price ? fmtRSD(p.recommended_price) : '—'}</td>
      <td>${marginBadge(p.margin_percent)}</td>
      <td>${statusBadge(p.status)}</td>
    </tr>
  `).join('');
}

function renderProizvodiTroskovi(products) {
  const tbody = document.getElementById('proizvodiTroskoviTbody');
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text3)">Nema podataka.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td>
        <div class="cell-title" title="${esc(p.title)}">${esc(p.title)}</div>
        <div class="table-muted">${p.sku ? `SKU: ${esc(p.sku)}` : 'Bez SKU'}</div>
      </td>
      <td>${p.cost_rsd ? fmtRSD(p.cost_rsd) : '<span class="badge badge-red">Nije uneto</span>'}</td>
      <td>${yesNoBadge(Number(p.purchase_vat_included), 'Uključen', 'Isključen')}</td>
      <td>${fmtRSD(p.packaging_cost_rsd || 0)}</td>
      <td>${yesNoBadge(Number(p.packaging_vat_included), 'Uključen', 'Isključen')}</td>
      <td>${fmtRSD(p.extra_cost_rsd || 0)}</td>
      <td>${fmtRSD(p.target_cpa_rsd || 0)}</td>
      <td>${fmtRSD(p.margin_rsd || 0)}</td>
      <td style="font-weight:700">${fmtRSD(p.recommended_price || 0)}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openProductCostEditor('${esc(p.product_id)}')">Izmeni</button></td>
    </tr>
  `).join('');
}

function renderCostHistory(items) {
  const wrap = document.getElementById('proizvodiCostHistory');
  if (!wrap) return;
  if (!items?.length) {
    wrap.innerHTML = `<div class="card"><div class="empty-state"><h3>Nema istorije</h3><p>Još nema sačuvanih promena nabavnih cena.</p></div></div>`;
    return;
  }

  const groups = {};
  items.forEach(item => {
    const pid = String(item.product_id);
    groups[pid] ||= { title: item.title, rows: [] };
    groups[pid].rows.push(item);
  });

  wrap.innerHTML = Object.entries(groups).map(([pid, group]) => `
    <div class="card history-card">
      <div class="section-head compact">
        <div>
          <div class="section-title">${esc(group.title || pid)}</div>
          <div class="section-subtitle">${group.rows.length} promena</div>
        </div>
      </div>
      <div class="history-list">
        ${group.rows.map(row => `
          <div class="history-item">
            <div>
              <div class="history-price">${fmtRSD(row.cost_rsd || 0)}</div>
              <div class="history-meta">${row.note || 'Bez napomene'} · Datum: ${new Date(row.valid_from).toLocaleDateString('sr-RS')}</div>
            </div>
            <button class="history-delete" onclick="deleteProductCostHistory(${row.id})">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderSalesHistory(items) {
  const wrap = document.getElementById('proizvodiSalesHistory');
  if (!wrap) return;
  if (!items?.length) {
    wrap.innerHTML = `<div class="card"><div class="empty-state"><h3>Nema istorije</h3><p>Prodajne cene još nisu povučene iz Shopify istorije.</p></div></div>`;
    return;
  }

  wrap.innerHTML = items.map(group => {
    const change = group.change_percent;
    const cls = change === null ? 'badge-gray' : change >= 0 ? 'badge-green' : 'badge-red';
    const sign = change > 0 ? '+' : '';
    return `
      <div class="card history-card">
        <div class="section-head compact">
          <div>
            <div class="section-title">${esc(group.title || group.product_id)}</div>
            <div class="section-subtitle">Istorija prodajne cene</div>
          </div>
          <span class="badge ${cls}">${change === null ? 'Nema poređenja' : `${sign}${fmtPct(change)}`}</span>
        </div>
        <div class="history-list">
          ${(group.history || []).slice(0, 10).map(row => `
            <div class="history-item">
              <div>
                <div class="history-price">${fmtRSD(row.price_rsd || 0)}</div>
                <div class="history-meta">${new Date(row.captured_at).toLocaleString('sr-RS')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.loadProizvodi = async function(forceHistory = false) {
  try {
    const res = await fetch(`/api/finansije/products?${buildProductsQuery()}`);
    const data = await res.json();
    window.proizvodiState.products = data.products || [];
    renderProizvodiStats(window.proizvodiState.products);
    renderProizvodiLista(window.proizvodiState.products);
    renderProizvodiTroskovi(window.proizvodiState.products);

    if (forceHistory || window.proizvodiState.activeTab === 'nabavne') await loadProductCostHistory();
    if (forceHistory || window.proizvodiState.activeTab === 'prodajne') await loadProductSalesHistory();
  } catch (e) {
    const ids = ['proizvodiListaTbody', 'proizvodiTroskoviTbody'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:#ef4444">Greška pri učitavanju.</td></tr>`;
    });
  }
};

async function loadProductCostHistory() {
  const { storeId } = getProizvodiParams();
  const res = await fetch(`/api/finansije/product-cost-history?store_id=${storeId}`);
  const data = await res.json();
  renderCostHistory(data.items || []);
}

async function loadProductSalesHistory() {
  const { storeId } = getProizvodiParams();
  const res = await fetch(`/api/finansije/product-sales-history?store_id=${storeId}`);
  const data = await res.json();
  renderSalesHistory(data.items || []);
}

function modalEl(id) { return document.getElementById(id); }
function modalNumber(id) { return Number(String(modalEl(id)?.value || 0).replace(',', '.')) || 0; }

function updateProductCostPreview() {
  const purchase = modalNumber('pc_purchase_price');
  const packaging = modalNumber('pc_packaging_cost');
  const other = modalNumber('pc_other_costs');
  const maxCpa = modalNumber('pc_max_cpa');
  const margin = modalNumber('pc_target_margin');
  const packagingVat = modalEl('pc_packaging_vat')?.checked;
  const packagingGross = packagingVat ? packaging : (packaging * 1.2);
  const cogs = purchase + packagingGross + other;
  const recommended = cogs + maxCpa + margin;
  modalEl('pc_preview_purchase').textContent = fmtRSD(purchase);
  modalEl('pc_preview_packaging').textContent = fmtRSD(packagingGross);
  modalEl('pc_preview_cogs').textContent = fmtRSD(cogs);
  modalEl('pc_preview_recommended').textContent = fmtRSD(recommended);
}

function openProductCostModal(product) {
  window.proizvodiState.editingProduct = product;
  modalEl('productCostModalTitle').textContent = product.title || 'Troškovi proizvoda';
  modalEl('pc_purchase_price').value = Number(product.cost_rsd || 0);
  modalEl('pc_packaging_cost').value = Number(product.packaging_cost_rsd || 0);
  modalEl('pc_other_costs').value = Number(product.extra_cost_rsd || 0);
  modalEl('pc_max_cpa').value = Number(product.target_cpa_rsd || 0);
  modalEl('pc_target_margin').value = Number(product.margin_rsd || 0);
  modalEl('pc_purchase_vat').checked = !!Number(product.purchase_vat_included || 0);
  modalEl('pc_packaging_vat').checked = !!Number(product.packaging_vat_included || 0);
  modalEl('pc_valid_from').value = getTodayStr();
  updateProductCostPreview();
  modalEl('productCostModal').style.display = 'flex';
}

function closeProductCostModal() {
  modalEl('productCostModal').style.display = 'none';
  window.proizvodiState.editingProduct = null;
}

window.openProductCostEditor = function(productId) {
  const product = (window.proizvodiState.products || []).find(p => String(p.product_id) === String(productId));
  if (!product) return;
  openProductCostModal(product);
};

window.saveProductCost = async function(payload) {
  try {
    const res = await fetch('/api/finansije/product-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Greška pri čuvanju');
    showToast('Trošak je sačuvan', 'success');
    closeProductCostModal();
    await window.loadProizvodi(true);
  } catch (e) {
    showToast(e.message || 'Greška pri čuvanju', 'error');
  }
};

window.deleteProductCostHistory = async function(id) {
  if (!confirm('Obrisati ovu stavku istorije?')) return;
  try {
    const res = await fetch(`/api/finansije/product-cost-history/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Greška pri brisanju');
    showToast('Stavka je obrisana', 'success');
    await window.loadProizvodi(true);
  } catch (e) {
    showToast(e.message || 'Greška pri brisanju', 'error');
  }
};

function activateProizvodiTab(tab) {
  window.proizvodiState.activeTab = tab;
  document.querySelectorAll('.proizvodi-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.proizvodiTab === tab));
  document.querySelectorAll('.proizvodi-pane').forEach(pane => pane.classList.toggle('active', pane.id === `proizvodi-pane-${tab}`));
  if (tab === 'nabavne') loadProductCostHistory();
  if (tab === 'prodajne') loadProductSalesHistory();
}

function activatePeriod(period) {
  window.proizvodiState.period = period;
  document.querySelectorAll('.period-pill').forEach(btn => btn.classList.toggle('active', btn.dataset.period === period));
  const custom = document.getElementById('proizvodiCustomRange');
  if (custom) custom.style.display = period === 'custom' ? 'flex' : 'none';
  if (period !== 'custom') window.loadProizvodi();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('proizvodiDateFrom').value = getTodayStr();
  document.getElementById('proizvodiDateTo').value = getTodayStr();
  window.proizvodiState.dateFrom = getTodayStr();
  window.proizvodiState.dateTo = getTodayStr();

  document.getElementById('proizvodiRefreshBtn')?.addEventListener('click', () => window.loadProizvodi(true));
  document.querySelectorAll('.proizvodi-tab').forEach(btn => btn.addEventListener('click', () => activateProizvodiTab(btn.dataset.proizvodiTab)));
  document.querySelectorAll('.period-pill').forEach(btn => btn.addEventListener('click', () => activatePeriod(btn.dataset.period)));
  document.getElementById('proizvodiDateFrom')?.addEventListener('change', e => window.proizvodiState.dateFrom = e.target.value);
  document.getElementById('proizvodiDateTo')?.addEventListener('change', e => window.proizvodiState.dateTo = e.target.value);
  document.getElementById('proizvodiApplyCustom')?.addEventListener('click', () => {
    if (!window.proizvodiState.dateFrom || !window.proizvodiState.dateTo) return showToast('Izaberi oba datuma', 'error');
    if (window.proizvodiState.dateFrom > window.proizvodiState.dateTo) return showToast('OD datum ne može biti posle DO datuma', 'error');
    window.loadProizvodi();
  });

  ['pc_purchase_price','pc_packaging_cost','pc_other_costs','pc_max_cpa','pc_target_margin','pc_purchase_vat','pc_packaging_vat'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateProductCostPreview);
    document.getElementById(id)?.addEventListener('change', updateProductCostPreview);
  });

  document.getElementById('productCostModalClose')?.addEventListener('click', closeProductCostModal);
  document.getElementById('productCostModalCancel')?.addEventListener('click', closeProductCostModal);
  document.getElementById('productCostModal')?.addEventListener('click', (e) => { if (e.target.id === 'productCostModal') closeProductCostModal(); });
  document.getElementById('productCostModalSave')?.addEventListener('click', () => {
    const product = window.proizvodiState.editingProduct;
    if (!product) return;
    saveProductCost({
      product_id: product.product_id,
      shopify_product_id: product.shopify_product_id,
      title: product.title,
      cost_rsd: modalNumber('pc_purchase_price'),
      packaging_cost_rsd: modalNumber('pc_packaging_cost'),
      extra_cost_rsd: modalNumber('pc_other_costs'),
      target_cpa_rsd: modalNumber('pc_max_cpa'),
      margin_rsd: modalNumber('pc_target_margin'),
      purchase_vat_included: modalEl('pc_purchase_vat').checked,
      packaging_vat_included: modalEl('pc_packaging_vat').checked,
      valid_from: modalEl('pc_valid_from').value || getTodayStr()
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl('productCostModal')?.style.display === 'flex') closeProductCostModal();
  });
});
