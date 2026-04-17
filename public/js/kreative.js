// ─── Kreative.js ──────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────────
  let kreativeData  = [];   // sve kreative (Ad nivo)
  let currentPeriod = '7d';
  let customFrom    = null;
  let customTo      = null;
  let sortCol       = 'spend';
  let sortDir       = 'desc';
  let filterStatus  = 'all';
  let filterSearch  = '';

  // Drill-down state
  // level: 'ads' | 'adsets' | 'ad'
  let drillLevel    = 'ads';  // počinjemo na nivou svih Ads
  let drillAdsetId  = null;   // kad smo unutar jednog AdSeta
  let drillAdsetName = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }
  function showLoading(on) { const el = document.getElementById('kreativeLoading'); if (el) el.style.display = on ? 'flex' : 'none'; }
  function showError(msg)  { const el = document.getElementById('kreativeError');   if (el) { el.textContent = msg; el.style.display = 'block'; } else console.error(msg); }
  function hideError()     { const el = document.getElementById('kreativeError');   if (el) el.style.display = 'none'; }

  // Datum: ISO → dd.mm.yyyy.
  function fmtDate(s) {
    if (!s) return '—';
    // Prihvata YYYY-MM-DD ili ISO datetime
    const d = s.length > 10 ? new Date(s) : new Date(s + 'T00:00:00');
    if (isNaN(d)) return s;
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}.`;
  }

  // Izvlači SKU iz naziva kreative: naziv_SKU_kod_... → drugi segment
  function extractSku(name) {
    if (!name) return null;
    const parts = name.split('_');
    // Mora biti bar 2 segmenta i drugi segment ne sme biti broj (jer bi to bila sekvenca)
    if (parts.length >= 2 && isNaN(parts[1])) return parts[1];
    return null;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function initKreative() {
    drillLevel   = 'ads';
    drillAdsetId = null;
    bindPeriodButtons();
    bindSearch();
    bindStatusFilter();
    bindCustomDatePicker();
    bindModalButtons();
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllModals();
    });
    loadKreative();
  }
  window.loadKreative = initKreative;
  window._kreativeDrillAdsets = function() {
    drillLevel = 'adsets'; drillAdsetId = null; drillAdsetName = null;
    renderView(); renderCharts();
  };

  // ─── Period ───────────────────────────────────────────────────────────────────
  function bindPeriodButtons() {
    document.querySelectorAll('#kreativePeriodBtns .period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#kreativePeriodBtns .period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;
        const customRow = document.getElementById('kreativeCustomDate');
        if (customRow) customRow.style.display = currentPeriod === 'custom' ? 'flex' : 'none';
        if (currentPeriod !== 'custom') { customFrom = null; customTo = null; loadKreative(); }
      });
    });
  }

  function bindCustomDatePicker() {
    document.getElementById('kreativeApplyDate')?.addEventListener('click', () => {
      const f = document.getElementById('kreativeFromDate')?.value;
      const t = document.getElementById('kreativeToDate')?.value;
      if (!f || !t) return;
      customFrom = f; customTo = t; currentPeriod = 'custom';
      document.querySelectorAll('#kreativePeriodBtns .period-btn').forEach(b => b.classList.remove('active'));
      loadKreative();
    });
  }

  function bindSearch() {
    document.getElementById('kreativeSearch')?.addEventListener('input', e => {
      filterSearch = e.target.value.toLowerCase();
      renderView();
    });
  }

  function bindStatusFilter() {
    document.querySelectorAll('#kreativeStatusFilter .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#kreativeStatusFilter .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterStatus = btn.dataset.status;
        renderView();
      });
    });
  }

  // ─── Load ─────────────────────────────────────────────────────────────────────
  async function loadKreative() {
    const storeId = window.currentStoreId || 'all';
    showLoading(true); hideError();

    let url = `/api/creatives?store_id=${storeId}&period=${currentPeriod}`;
    if (currentPeriod === 'custom' && customFrom && customTo) url += `&from=${customFrom}&to=${customTo}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (data.error) { showError(data.error); return; }

      kreativeData = (data.creatives || []).map(c => ({ ...c, sku: extractSku(c.name) }));
      renderDugovanje(data.meta_dugovanje || 0);
      renderPeriodInfo(data.period);
      renderView();
      renderCharts();
    } catch (e) {
      showError('Greška pri učitavanju: ' + e.message);
    } finally {
      showLoading(false);
    }
  }

  // ─── Dugovanje ────────────────────────────────────────────────────────────────
  function renderDugovanje(val) {
    const el = document.getElementById('metaDugovanje');
    if (el) el.textContent = (window.fmtNum ? window.fmtNum(val, 2) : val.toFixed(2)) + ' USD';
  }

  function renderPeriodInfo(period) {
    const el = document.getElementById('kreativePeriodLabel');
    if (el && period) el.textContent = `${fmtDate(period.from)} — ${fmtDate(period.to)}`;
  }

  // ─── Drill-down navigacija ────────────────────────────────────────────────────
  function renderBreadcrumb() {
    const el = document.getElementById('kreativeBreadcrumb');
    if (!el) return;

    if (drillLevel === 'ads') {
      el.innerHTML = '<span class="breadcrumb-current">Sve kreative</span>';
    } else if (drillLevel === 'adsets') {
      el.innerHTML = `
        <span class="breadcrumb-item" id="bcAllAds">← Sve kreative</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">Ad Setovi</span>`;
      document.getElementById('bcAllAds')?.addEventListener('click', () => {
        drillLevel = 'ads'; drillAdsetId = null; drillAdsetName = null; renderView(); renderCharts();
      });
    } else if (drillLevel === 'adset_ads') {
      el.innerHTML = `
        <span class="breadcrumb-item" id="bcAllAds2">Sve kreative</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-item" id="bcAdsets">Ad Setovi</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${escHtml(truncate(drillAdsetName || drillAdsetId, 40))}</span>`;
      document.getElementById('bcAllAds2')?.addEventListener('click', () => {
        drillLevel = 'ads'; drillAdsetId = null; drillAdsetName = null; renderView(); renderCharts();
      });
      document.getElementById('bcAdsets')?.addEventListener('click', () => {
        drillLevel = 'adsets'; drillAdsetId = null; renderView(); renderCharts();
      });
    }
  }

  // ─── Glavni renderView ────────────────────────────────────────────────────────
  function renderView() {
    renderBreadcrumb();
    if (drillLevel === 'ads')       renderAdsTable(kreativeData);
    else if (drillLevel === 'adsets') renderAdsetsTable();
    else if (drillLevel === 'adset_ads') renderAdsTable(kreativeData.filter(c => c.adset_id === drillAdsetId));
  }

  // ─── AdSet grupisan prikaz ────────────────────────────────────────────────────
  function renderAdsetsTable() {
    const tbody = document.getElementById('kreativeTableBody');
    const thead = document.querySelector('#kreativeTable thead tr');
    if (!tbody) return;

    // Grupiši po adset_id
    const adsetMap = {};
    kreativeData.forEach(c => {
      if (!adsetMap[c.adset_id]) {
        adsetMap[c.adset_id] = { adset_id: c.adset_id, store_id: c.store_id, ads: [], spend: 0, roas_sum: 0, roas_cnt: 0, impressions: 0, purchases: 0, add_to_cart: 0 };
      }
      const a = adsetMap[c.adset_id];
      a.ads.push(c);
      a.spend       += c.spend || 0;
      a.impressions += c.impressions || 0;
      a.purchases   += c.purchases || 0;
      a.add_to_cart += c.add_to_cart || 0;
      if (c.roas != null) { a.roas_sum += c.roas; a.roas_cnt++; }
    });

    const adsets = Object.values(adsetMap);
    adsets.forEach(a => {
      a.roas = a.roas_cnt > 0 ? a.roas_sum / a.roas_cnt : null;
      // Ime — uzmi naziv prve kreative i skrati
      const firstName = (a.ads[0]?.name || '').split('_')[0] || a.adset_id;
      a.name = firstName;
    });
    adsets.sort((a,b) => b.spend - a.spend);

    // Header za adset prikaz
    if (thead) thead.innerHTML = `
      <th>Ad Set</th>
      <th>Kreativa</th>
      <th data-sort="spend" class="sort-desc">Spend</th>
      <th>ROAS</th>
      <th>Impr.</th>
      <th>Purchase</th>
      <th>Add to Cart</th>
      <th>Akcije</th>`;

    tbody.innerHTML = adsets.map(a => {
      const roasClass = a.roas >= 2 ? 'roas-good' : a.roas >= 1 ? 'roas-mid' : a.roas != null ? 'roas-bad' : '';
      const roas  = a.roas  != null ? (window.fmtNum ? window.fmtNum(a.roas, 2) : a.roas.toFixed(2)) + 'x' : '—';
      const spend = (window.fmtNum ? window.fmtNum(a.spend, 2) : a.spend.toFixed(2)) + ' USD';
      return `<tr class="kreative-row level-adset" style="cursor:pointer" data-adsetid="${escHtml(a.adset_id)}" data-storeid="${a.store_id}">
        <td class="td-name"><span class="kreativa-name">${escHtml(truncate(a.name, 36))}</span></td>
        <td class="td-num">${a.ads.length}</td>
        <td class="td-num">${spend}</td>
        <td class="td-num ${roasClass}">${roas}</td>
        <td class="td-num">${a.impressions.toLocaleString('sr-RS')}</td>
        <td class="td-num">${a.purchases}</td>
        <td class="td-num">${a.add_to_cart}</td>
        <td class="td-actions">
          <button class="btn-icon btn-budget" title="Promeni budžet" data-adsetid="${escHtml(a.adset_id)}" data-storeid="${a.store_id}">💰</button>
          <button class="btn-icon btn-scale"  title="Skaliraj"        data-adsetid="${escHtml(a.adset_id)}" data-storeid="${a.store_id}">📈</button>
        </td>
      </tr>`;
    }).join('');

    // Klik na red → idi u kreative tog Ad Seta
    tbody.querySelectorAll('.level-adset').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('.td-actions')) return;
        const adsetId = tr.dataset.adsetid;
        const ads = kreativeData.filter(c => c.adset_id === adsetId);
        const name = (ads[0]?.name || '').split('_')[0] || adsetId;
        drillLevel    = 'adset_ads';
        drillAdsetId  = adsetId;
        drillAdsetName = name;
        renderView(); renderCharts();
      });
    });

    // Akcijska dugmad
    tbody.querySelectorAll('.btn-budget').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openBudgetModal(btn.dataset.adsetid, btn.dataset.storeid); }));
    tbody.querySelectorAll('.btn-scale').forEach(btn  => btn.addEventListener('click', e => { e.stopPropagation(); openScaleModal(btn.dataset.adsetid, btn.dataset.storeid); }));

    // Restore header sortiranje
    bindTableSort();
  }

  // ─── Ads tabela (nivo kreativa) ───────────────────────────────────────────────
  function renderAdsTable(source) {
    const tbody = document.getElementById('kreativeTableBody');
    const thead = document.querySelector('#kreativeTable thead tr');
    if (!tbody) return;

    // Restore original header
    if (thead) thead.innerHTML = `
      <th data-sort="name">Naziv kreative</th>
      <th data-sort="status">Status</th>
      <th data-sort="spend" class="sort-desc">Spend</th>
      <th data-sort="roas">ROAS</th>
      <th data-sort="ctr">CTR</th>
      <th data-sort="frequency">Freq.</th>
      <th data-sort="impressions">Impr.</th>
      <th data-sort="purchases">Purchase</th>
      <th data-sort="add_to_cart">Add to Cart</th>
      <th data-sort="dana_aktivan">Dana aktiv.</th>
      <th>Akcije</th>`;

    let data = [...source];
    if (filterStatus !== 'all') data = data.filter(c => c.status === filterStatus);
    if (filterSearch)           data = data.filter(c => (c.name||'').toLowerCase().includes(filterSearch) || (c.sku||'').toLowerCase().includes(filterSearch));

    // Sort
    data.sort((a,b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">Nema kreativa za izabrani filter.</td></tr>`;
      bindTableSort(); return;
    }

    const fmt = v => window.fmtNum ? window.fmtNum(v, 2) : Number(v).toFixed(2);

    tbody.innerHTML = data.map(c => {
      const roasClass   = c.roas >= 2 ? 'roas-good' : c.roas >= 1 ? 'roas-mid' : c.roas != null ? 'roas-bad' : '';
      const statusClass = c.status === 'ACTIVE' ? 'status-active' : 'status-paused';
      const statusLabel = c.status === 'ACTIVE' ? 'Aktivan' : c.status === 'PAUSED' ? 'Pauziran' : (c.status || '—');
      const pauseIcon   = c.status === 'ACTIVE' ? '⏸' : '▶';
      const pauseTitle  = c.status === 'ACTIVE' ? 'Pauziraj' : 'Aktiviraj';
      return `
      <tr class="kreative-row" data-adid="${escHtml(c.ad_id)}" data-adsetid="${escHtml(c.adset_id)}"
          data-storeid="${c.store_id}" data-status="${c.status}" data-name="${escHtml(c.name)}">
        <td class="td-name" title="${escHtml(c.name)}">
          <span class="kreativa-name">${escHtml(truncate(c.name, 38))}</span>
          ${c.sku ? `<span class="sku-badge">${escHtml(c.sku)}</span>` : ''}
        </td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td class="td-num">${c.spend != null ? fmt(c.spend) + ' USD' : '—'}</td>
        <td class="td-num ${roasClass}">${c.roas != null ? fmt(c.roas) + 'x' : '—'}</td>
        <td class="td-num">${c.ctr != null ? fmt(c.ctr) + '%' : '—'}</td>
        <td class="td-num">${c.frequency != null ? fmt(c.frequency) : '—'}</td>
        <td class="td-num">${c.impressions ? c.impressions.toLocaleString('sr-RS') : '—'}</td>
        <td class="td-num">${c.purchases ?? '—'}</td>
        <td class="td-num">${c.add_to_cart ?? '—'}</td>
        <td class="td-num">${c.dana_aktivan ?? '—'}</td>
        <td class="td-actions">
          <button class="btn-icon btn-budget" title="Promeni budžet"
            data-adsetid="${escHtml(c.adset_id)}" data-storeid="${c.store_id}">💰</button>
          <button class="btn-icon btn-toggle-status" title="${pauseTitle}"
            data-objectid="${escHtml(c.ad_id)}" data-type="ad" data-storeid="${c.store_id}"
            data-adid="${escHtml(c.ad_id)}" data-status="${c.status}">${pauseIcon}</button>
          <button class="btn-icon btn-scale" title="Skaliraj budžet"
            data-adsetid="${escHtml(c.adset_id)}" data-storeid="${c.store_id}">📈</button>
        </td>
      </tr>`;
    }).join('');

    // Dugmad
    tbody.querySelectorAll('.btn-budget').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openBudgetModal(btn.dataset.adsetid, btn.dataset.storeid); }));
    tbody.querySelectorAll('.btn-toggle-status').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const newStatus = btn.dataset.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      confirmToggleStatus(btn.dataset.objectid, 'ad', newStatus, btn.dataset.storeid, btn.dataset.adid);
    }));
    tbody.querySelectorAll('.btn-scale').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openScaleModal(btn.dataset.adsetid, btn.dataset.storeid); }));

    bindTableSort();
  }

  function bindTableSort() {
    document.querySelectorAll('#kreativeTable th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = col; sortDir = 'desc'; }
        document.querySelectorAll('#kreativeTable th[data-sort]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
        th.classList.add('sort-' + sortDir);
        renderView();
      };
    });
  }

  // ─── Charts ───────────────────────────────────────────────────────────────────
  function renderCharts() {
    const source = drillLevel === 'adset_ads'
      ? kreativeData.filter(c => c.adset_id === drillAdsetId)
      : kreativeData;
    const top = source.filter(c => c.spend > 0).sort((a,b) => b.spend - a.spend).slice(0, 12);
    if (!top.length) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#9ca3af' : '#475569';

    buildChart('chartROASKreative', top.map(c => truncate(c.name,18)), top.map(c => c.roas||0), 'ROAS', isDark ? '#f59e0b' : '#d4a017', gridColor, textColor);
    buildChart('chartSpendKreative', top.map(c => truncate(c.name,18)), top.map(c => c.spend||0), 'Spend (USD)', isDark ? '#6366f1' : '#4f46e5', gridColor, textColor);
  }

  function buildChart(id, labels, values, label, color, gridColor, textColor) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
    canvas._chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label, data: values, backgroundColor: color + 'cc', borderRadius: 4 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => label + ': ' + Number(ctx.raw).toFixed(2) } } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 }, maxRotation: 35 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });
  }

  // ─── Budget Modal ──────────────────────────────────────────────────────────────
  async function openBudgetModal(adsetId, storeId) {
    const modal = document.getElementById('budgetModal');
    if (!modal) return;
    document.getElementById('budgetAdsetId').value = adsetId;
    document.getElementById('budgetStoreId').value = storeId;
    document.getElementById('budgetAmount').value  = '';
    document.getElementById('budgetNote').value    = '';
    document.getElementById('budgetCurrentVal').textContent = 'Učitavam…';
    modal.classList.add('active');
    try {
      const res  = await fetch(`/api/creatives/adset/${adsetId}/budget?store_id=${storeId}`);
      const data = await res.json();
      const daily = data.daily_budget    ? (parseFloat(data.daily_budget)    / 100).toFixed(2) : null;
      const life  = data.lifetime_budget ? (parseFloat(data.lifetime_budget) / 100).toFixed(2) : null;
      document.getElementById('budgetCurrentVal').textContent = daily ? `Daily: ${daily} ${data.currency||'USD'}` : life ? `Lifetime: ${life} ${data.currency||'USD'}` : 'Nepoznat';
      document.getElementById('budgetTypeLabel').textContent  = daily ? '(dnevni budžet)' : '(lifetime budžet)';
      modal.dataset.budgetType = daily ? 'daily' : 'lifetime';
    } catch { document.getElementById('budgetCurrentVal').textContent = 'Greška'; }
  }

  // ─── Scale Modal ───────────────────────────────────────────────────────────────
  function openScaleModal(adsetId, storeId) {
    const modal = document.getElementById('scaleModal');
    if (!modal) return;
    document.getElementById('scaleAdsetId').value = adsetId;
    document.getElementById('scaleStoreId').value = storeId;
    document.getElementById('scalePercent').value = '20';
    document.getElementById('scaleNote').value    = '';
    modal.classList.add('active');
  }

  // ─── Status Toggle ─────────────────────────────────────────────────────────────
  async function confirmToggleStatus(objectId, type, newStatus, storeId, adId) {
    const action = newStatus === 'PAUSED' ? 'pauzirati' : 'aktivirati';
    if (!confirm(`Da li želiš da ${action} ovu kreativu?`)) return;
    try {
      const res  = await fetch('/api/creatives/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, object_id: objectId, object_type: type, status: newStatus, ad_id: adId })
      });
      const data = await res.json();
      if (data.error) { window.showToast && window.showToast(data.error, 'error'); return; }
      window.showToast && window.showToast(`Status → ${newStatus}`, 'success');
      loadKreative();
    } catch (e) { window.showToast && window.showToast('Greška: ' + e.message, 'error'); }
  }

  // ─── Modal dugmad ──────────────────────────────────────────────────────────────
  function closeAllModals() { document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); }

  function bindModalButtons() {
    // Budget save
    document.getElementById('budgetSaveBtn')?.addEventListener('click', async () => {
      const adsetId  = document.getElementById('budgetAdsetId').value;
      const storeId  = document.getElementById('budgetStoreId').value;
      const amount   = document.getElementById('budgetAmount').value;
      const note     = document.getElementById('budgetNote').value;
      const budgType = document.getElementById('budgetModal').dataset.budgetType || 'daily';
      if (!amount || isNaN(amount)) { window.showToast && window.showToast('Unesi validan iznos.', 'error'); return; }
      try {
        const body = { store_id: storeId, adset_id: adsetId, note };
        body[budgType + '_budget'] = amount;
        const res = await fetch('/api/creatives/budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.error) { window.showToast && window.showToast(data.error, 'error'); return; }
        window.showToast && window.showToast('Budžet promenjen!', 'success');
        closeAllModals(); loadKreative();
      } catch (e) { window.showToast && window.showToast('Greška: ' + e.message, 'error'); }
    });

    // Scale save
    document.getElementById('scaleSaveBtn')?.addEventListener('click', async () => {
      const adsetId = document.getElementById('scaleAdsetId').value;
      const storeId = document.getElementById('scaleStoreId').value;
      const percent = document.getElementById('scalePercent').value;
      const note    = document.getElementById('scaleNote').value;
      if (!percent || isNaN(percent)) { window.showToast && window.showToast('Unesi validan procenat.', 'error'); return; }
      try {
        const res  = await fetch('/api/creatives/scale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store_id: storeId, adset_id: adsetId, percent, note }) });
        const data = await res.json();
        if (data.error) { window.showToast && window.showToast(data.error, 'error'); return; }
        window.showToast && window.showToast(`Skaliran za ${percent}%!`, 'success');
        closeAllModals(); loadKreative();
      } catch (e) { window.showToast && window.showToast('Greška: ' + e.message, 'error'); }
    });

    // Zatvori modalove
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => el.addEventListener('click', closeAllModals));
  }

})();
