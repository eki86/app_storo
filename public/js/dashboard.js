function fmtRSD(v) {
  if (!v && v !== 0) return "—";
  return new Intl.NumberFormat("sr-RS", { style: "currency", currency: "RSD", maximumFractionDigits: 0 }).format(v);
}
function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return Number(v).toFixed(dec);
}

async function loadDashboard() {
  const storeId = window.currentStoreId || "all";
  const period  = document.getElementById("periodSelect")?.value || "30d";

  const ids = ["kpi-spend","kpi-revenue","kpi-roas","kpi-profit","kpi-orders","kpi-refunds"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "…"; });

  try {
    const [kpiRes, chartRes] = await Promise.all([
      fetch(`/api/dashboard/kpis?store_id=${storeId}&period=${period}`),
      fetch(`/api/dashboard/chart?store_id=${storeId}&period=${period}`)
    ]);

    const kpi   = await kpiRes.json();
    const chart = await chartRes.json();

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set("kpi-spend",   fmtRSD(kpi.spend));
    set("kpi-revenue", fmtRSD(kpi.revenue));
    set("kpi-orders",  kpi.orders ?? "—");
    set("kpi-refunds", kpi.refunds ?? "—");

    const roas = kpi.spend > 0 ? kpi.revenue / kpi.spend : null;
    const roasEl = document.getElementById("kpi-roas");
    if (roasEl) {
      roasEl.textContent = roas ? fmtNum(roas, 2) + "x" : "—";
      roasEl.style.color = roas >= 2 ? "#22c55e" : roas >= 1 ? "#f59e0b" : "#ef4444";
    }

    const profitEl = document.getElementById("kpi-profit");
    if (profitEl) {
      profitEl.textContent = kpi.profit != null ? fmtRSD(kpi.profit) : "—";
      profitEl.style.color = kpi.profit >= 0 ? "#22c55e" : "#ef4444";
    }

    renderBarChart(chart.data || []);
  } catch(e) {
    console.error("Dashboard error:", e);
  }
}

function renderBarChart(data) {
  const area = document.getElementById("dashChartArea");
  if (!area) return;
  if (!data.length) {
    area.innerHTML = "<div style=\"height:220px;display:flex;align-items:center;justify-content:center;color:var(--text3)\">Nema podataka</div>";
    return;
  }

  const max = Math.max(...data.map(d => d.value), 1);

  const bars = data.map(d => {
    const pct = Math.round((d.value / max) * 100);
    const safeH = Math.max(pct, 1);
    return `
      <div class="bar-wrap">
        <div class="bar-tooltip">${d.label}: ${fmtRSD(d.value)}</div>
        <div class="bar" style="height:${safeH}%"></div>
        <span class="bar-label">${d.label}</span>
      </div>`;
  }).join("");

  area.innerHTML = `<div class="chart-container"><div class="bar-chart">${bars}</div></div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("periodSelect")?.addEventListener("change", loadDashboard);
});

window.loadDashboard = loadDashboard;
