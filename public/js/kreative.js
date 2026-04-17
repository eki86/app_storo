// ─── Kreative.js ──────────────────────────────────────────────────────────────
// Upravljanje Meta Ads kreativama: prikaz, budžet, pauza/aktivacija, skaliranje

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  let kreativeData    = [];
  let currentPeriod   = '30d';
  let customFrom      = null;
  let customTo        = null;
  let sortCol         = 'spend';
  let sortDir         = 'desc';
  let filterStatus    = 'all'; // 'all' | 'ACTIVE' | 'PAUSED'
  let filterSearch    = '';

  // ─── Init ────────────────────────────────────────────────────────────────────
  function initKreative() {
    bindPeriodButtons();
    bindSearch();
    bindStatusFilter();
    bindCustomDatePicker();
    loadKreative();
  }
  window.loadKreative = initKreative;

  // ─── Period ──────────────────────────────────────────────────────────────────
  function bindPeriodButtons() {
    document.querySelectorAll('#kreativePeriodBtns .period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#kreativePeriodBtns .period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;
        if (currentPeriod !== 'custom') { customFrom = null; customTo = null; }
        loadKreative();
      });
    });
  }

  function bindCustomDatePicker() {
    const fromEl = document.getElementById('kreativeFromDate');
    const toEl   = document.getElementById('kreativeToDate');
    const applyBtn = document.getElementById('kreativeApplyDate');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', () => {
      if (!fromEl.value || !toEl.value) return;
      customFrom    = fromEl.value;
      customTo      = toEl.value;
      currentPeriod = 'custom';
      document.querySelectorAll('#kreativePeriodBtns .period-btn').forEach(b => b.classList.remove('active'));
      loadKreative();
    });
  }

  function bindSearch() {
    const searchEl = document.getElementById('kreativeSearch');
    if (!searchEl) return;
    searchEl.addEventListener('input', e => {
      filterSearch = e.target.value.toLowerCase();
      renderTable();
    });
  }

  function bindStatusFilter() {
    document.querySelectorAll('#kreativeStatusFilter .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#kreativeStatusFilter .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterStatus = btn.dataset.status;
        renderTable();
      });
    });
  }

  // ─── Load ────────────────────────────────────────────────────────────────────
  async function loadKreative() {
    const storeId = window.currentStoreId || 'all';
    showLoading(true);

    let url = `/api/creatives?store_id=${storeId}&period=${currentPeriod}`;
    if (currentPeriod === 'custom' && customFrom && customTo) {
      url += `&from=${customFrom}&to=${customTo}`;
    }

    try {
      const res  = await fetch(url);
      const data = await res.json();

      if (data.error) { showError(data.error); return; }

      kreativeData = data.creatives || [];
      renderDugovanje(data.meta_dugovanje || 0);
      renderPeriodInfo(data.period);
      renderTable();
      renderCharts();
    } catch (e) {
      showError('Greška pri učitavanju kreativa: ' + e.message);
    } finally {
      showLoading(false);
    }
  }

  // ─── Dugovanje ───────────────────────────────────────────────────────────────
  function renderDugovanje(val) {
    const el = document.getElementById('metaDugovanje');
    if (el) el.textContent = window.fmtNum ? window.fmtNum(val, 2) + ' USD' : val.toFixed(2) + ' USD';
  }

  function renderPeriodInfo(period) {
    const el = document.getElementById('kreativePeriodLabel');
    if (el && period) el.textContent = `${period.from} — ${period.to}`;
  }

  // ─── Table ───────────────────────────────────────────────────────────────────
  function getFilteredData() {
    let data = [...kreativeData];
    if (filterStatus !== 'all') data = data.filter(c => c.status === filterStatus);
    if (filterSearch) data = data.filter(c =>
      (c.name || '').toLowerCase().includes(filterSearch) ||
      (c.sku  || '').toLowerCase().includes(filterSearch)
    );
    return data;
  }

  function sortData(data) {
    return data.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('kreativeTableBody');
    if (!tbody) return;

    const data = sortData(getFilteredData());

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">Nema kreativa za izabrani period i filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(c => {
      const roasClass = c.roas >= 2 ? 'roas-good' : c.roas >= 1 ? 'roas-mid' : c.roas != null ? 'roas-bad' : '';
      const statusClass = c.status === 'ACTIVE' ? 'status-active' : 'status-paused';
      const statusLabel = c.status === 'ACTIVE' ? 'Aktivan' : c.status === 'PAUSED' ? 'Pauziran' : c.status;
      const roas  = c.roas   != null ? window.fmtNum(c.roas, 2) + 'x' : '—';
      const spend = c.spend  != null ? window.fmtNum(c.spend, 2) + ' USD' : '—';
      const ctr   = c.ctr    != null ? window.fmtNum(c.ctr, 2)   + '%' : '—';
      const freq  = c.frequency != null ? window.fmtNum(c.frequency, 2) : '—';
      const impr  = c.impressions ? c.impressions.toLocaleString('sr-RS') : '—';

      return `
      <tr class="kreative-row" data-adid="${escHtml(c.ad_id)}" data-adsetid="${escHtml(c.adset_id)}"
          data-campaignid="${escHtml(c.campaign_id)}" data-storeid="${c.store_id}"
          data-status="${c.status}" data-name="${escHtml(c.name)}">
        <td class="td-name" title="${escHtml(c.name)}">
          <span class="kreativa-name">${escHtml(truncate(c.name, 36))}</span>
          ${c.sku ? `<span class="sku-badge">${escHtml(c.sku)}</span>` : ''}
        </td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td class="td-num">${spend}</td>
        <td class="td-num ${roasClass}">${roas}</td>
        <td class="td-num">${ctr}</td>
        <td class="td-num">${freq}</td>
        <td class="td-num">${impr}</td>
        <td class="td-num">${c.purchases ?? '—'}</td>
        <td class="td-num">${c.add_to_cart ?? '—'}</td>
        <td class="td-num">${c.dana_aktivan ?? '—'}</td>
        <td class="td-actions">
          <button class="btn-icon btn-budget" title="Promeni budžet" data-adsetid="${escHtml(c.adset_id)}" data-storeid="${c.store_id}">💰</button>
          <button class="btn-icon btn-toggle-status" title="${c.status === 'ACTIVE' ? 'Pauziraj' : 'Aktiviraj'}"
            data-objectid="${escHtml(c.ad_id)}" data-type="ad" data-storeid="${c.store_id}"
            data-adid="${escHtml(c.ad_id)}" data-status="${c.status}">
            ${c.status === 'ACTIVE' ? '⏸' : '▶️'}
          </button>
          <button class="btn-icon btn-scale" title="Skaliraj budžet" data-adsetid="${escHtml(c.adset_id)}" data-storeid="${c.store_id}">📈</button>
        </td>
      </tr>`;
    }).join('');

    // Klikovi na dugmiće
    tbody.querySelectorAll('.btn-budget').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openBudgetModal(btn.dataset.adsetid, btn.dataset.storeid);
      });
    });

    tbody.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const newStatus = btn.dataset.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        confirmToggleStatus(btn.dataset.objectid, 'ad', newStatus, btn.dataset.storeid, btn.dataset.adid);
      });
    });

    tbody.querySelectorAll('.btn-scale').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openScaleModal(btn.dataset.adsetid, btn.dataset.storeid);
      });
    });

    // Sortiranje na klik headera
    document.querySelectorAll('#kreativeTable th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = col; sortDir = 'desc'; }
        document.querySelectorAll('#kreativeTable th[data-sort]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
        th.classList.add('sort-' + sortDir);
        renderTable();
      };
    });
  }

  // ─── Charts ──────────────────────────────────────────────────────────────────
  function renderCharts() {
    const data = getFilteredData().filter(c => c.spend > 0).slice(0, 15);
    if (!data.length) return;

    renderBarChartCanvas('chartROASKreative',
      data.map(c => truncate(c.name, 18)),
      data.map(c => c.roas || 0),
      'ROAS po kreativi', '#f59e0b'
    );

    renderBarChartCanvas('chartSpendKreative',
      data.map(c => truncate(c.name, 18)),
      data.map(c => c.spend || 0),
      'Spend po kreativi (USD)', '#6366f1'
    );
  }

  function renderBarChartCanvas(canvasId, labels, values, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart instance if any
    if (canvas._chart) { canvas._chart.destroy(); }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    const textColor  = isDark ? '#9ca3af' : '#6b7280';

    if (typeof Chart === 'undefined') return;

    canvas._chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label, data: values, backgroundColor: color + 'cc', borderRadius: 4 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => label + ': ' + ctx.raw.toFixed(2) } }
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });
  }

  // ─── Budget Modal ─────────────────────────────────────────────────────────────
  async function openBudgetModal(adsetId, storeId) {
    const modal = document.getElementById('budgetModal');
    if (!modal) return;

    document.getElementById('budgetAdsetId').value  = adsetId;
    document.getElementById('budgetStoreId').value  = storeId;
    document.getElementById('budgetAmount').value   = '';
    document.getElementById('budgetNote').value     = '';
    document.getElementById('budgetCurrentVal').textContent = 'Učitavam...';

    modal.classList.add('active');

    // Dohvati trenutni budžet
    try {
      const res  = await fetch(`/api/creatives/adset/${adsetId}/budget?store_id=${storeId}`);
      const data = await res.json();
      const daily = data.daily_budget ? (parseFloat(data.daily_budget) / 100).toFixed(2) : null;
      const life  = data.lifetime_budget ? (parseFloat(data.lifetime_budget) / 100).toFixed(2) : null;
      document.getElementById('budgetCurrentVal').textContent =
        daily ? `Daily: ${daily} ${data.currency || 'USD'}` :
        life  ? `Lifetime: ${life} ${data.currency || 'USD'}` : 'Nepoznat';
      document.getElementById('budgetTypeLabel').textContent = daily ? '(dnevni budžet)' : '(lifetime budžet)';
      modal.dataset.budgetType = daily ? 'daily' : 'lifetime';
    } catch (e) {
      document.getElementById('budgetCurrentVal').textContent = 'Greška';
    }
  }

  // ─── Scale Modal ─────────────────────────────────────────────────────────────
  function openScaleModal(adsetId, storeId) {
    const modal = document.getElementById('scaleModal');
    if (!modal) return;
    document.getElementById('scaleAdsetId').value = adsetId;
    document.getElementById('scaleStoreId').value = storeId;
    document.getElementById('scalePercent').value = '20';
    document.getElementById('scaleNote').value    = '';
    modal.classList.add('active');
  }

  // ─── Status Toggle ────────────────────────────────────────────────────────────
  async function confirmToggleStatus(objectId, type, newStatus, storeId, adId) {
    const action = newStatus === 'PAUSED' ? 'pauzirati' : 'aktivirati';
    if (!confirm(`Da li želiš da ${action} ovu kreativu?`)) return;
    await doSetStatus(objectId, type, newStatus, storeId, adId);
  }

  async function doSetStatus(objectId, type, status, storeId, adId) {
    try {
      const res  = await fetch('/api/creatives/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, object_id: objectId, object_type: type, status, ad_id: adId })
      });
      const data = await res.json();
      if (data.error) { window.showToast && window.showToast(data.error, 'error'); return; }
      window.showToast && window.showToast(`Status promenjen na ${status}`, 'success');
      loadKreative();
    } catch (e) {
      window.showToast && window.showToast('Greška: ' + e.message, 'error');
    }
  }

  // ─── Modal close buttons ──────────────────────────────────────────────────────
  function bindModalCloseButtons() {
    // Budget modal save
    document.getElementById('budgetSaveBtn')?.addEventListener('click', async () => {
      const adsetId   = document.getElementById('budgetAdsetId').value;
      const storeId   = document.getElementById('budgetStoreId').value;
      const amount    = document.getElementById('budgetAmount').value;
      const note      = document.getElementById('budgetNote').value;
      const budgType  = document.getElementById('budgetModal').dataset.budgetType || 'daily';
      if (!amount || isNaN(amount)) { window.showToast && window.showToast('Unesi validan iznos.', 'error'); return; }
      try {
        const body = { store_id: storeId, adset_id: adsetId, note };
        if (budgType === 'daily') body.daily_budget = amount;
        else body.lifetime_budget = amount;

        const res  = await fetch('/api/creatives/budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.error) { window.showToast && window.showToast(data.error, 'error'); return; }
        window.showToast && window.showToast('Budžet uspešno promenjen!', 'success');
        document.getElementById('budgetModal').classList.remove('active');
        loadKreative();
      } catch (e) {
        window.showToast && window.showToast('Greška: ' + e.message, 'error');
      }
    });

    // Scale modal save
    document.getElementById('scaleSaveBtn')?.addEventListener('click', async () => {
      const adsetId = document.getElementById('scaleAdsetId').value;
      const storeId = document.getElementById('scaleStoreId').value;
      const percent = document.getElementById('scalePercent').value;
      const note    = document.getElementById('scaleNote').value;
      if (!percent || isNaN(percent)) { window.showToast && window.showToast('Unesi validan procenat.', 'error'); return; }
      try {
        const res  = await fetch('/api/creatives/scale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, adset_id: adsetId, percent, note })
        });
        const data = await res.json();
        if (data.error) { window.showToast && window.showToast(data.error, 'error'); return; }
        window.showToast && window.showToast(`Budžet skaliran za ${percent}%!`, 'success');
        document.getElementById('scaleModal').classList.remove('active');
        loadKreative();
      } catch (e) {
        window.showToast && window.showToast('Greška: ' + e.message, 'error');
      }
    });

    // Modal close (X i backdrop)
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
      });
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '…' : str;
  }
  function showLoading(show) {
    const el = document.getElementById('kreativeLoading');
    if (el) el.style.display = show ? 'flex' : 'none';
  }
  function showError(msg) {
    const el = document.getElementById('kreativeError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  // ─── DOMContentLoaded ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    bindModalCloseButtons();
    // Escape key zatvara modele
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
      }
    });
  });

})();
