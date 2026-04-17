window.loadFinansije = async function() {
  const storeId  = window.currentStoreId || "all";
  const period   = document.getElementById("finansijePeriod")?.value || "30d";
  const summaryEl  = document.getElementById("finansijeSummary");
  const productsEl = document.getElementById("finansijeProducts");

  if (summaryEl) summaryEl.innerHTML = "<p style='color:var(--text3)'>Učitavam...</p>";

  try {
    const [sumRes, prodRes] = await Promise.all([
      fetch(`/api/finansije/summary?store_id=${storeId}&period=${period}`),
      fetch(`/api/finansije/products?store_id=${storeId}&period=${period}`)
    ]);
    const sum  = await sumRes.json();
    const prod = await prodRes.json();

    const mc = sum.margin > 20 ? "#22c55e" : sum.margin > 10 ? "#f59e0b" : "#ef4444";
    const rc = sum.roas >= 2 ? "#22c55e" : sum.roas >= 1 ? "#f59e0b" : "#ef4444";

    if (summaryEl) summaryEl.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:24px;">
        <div class="kpi-card"><div class="kpi-label">Prihod</div><div class="kpi-value">${fmtRSD(sum.revenue)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Profit</div><div class="kpi-value" style="color:${sum.profit>=0?"#22c55e":"#ef4444"}">${fmtRSD(sum.profit)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Marža</div><div class="kpi-value" style="color:${mc}">${fmtNum(sum.margin,1)}%</div></div>
        <div class="kpi-card"><div class="kpi-label">ROAS</div><div class="kpi-value" style="color:${rc}">${sum.roas?fmtNum(sum.roas,2)+"x":"—"}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:14px;font-weight:700;margin-bottom:16px;">💸 Struktura troškova</div>
        ${costRow("Ad Spend", sum.costs?.ad_spend, sum.revenue)}
        ${costRow("COGS (roba)", sum.costs?.cogs, sum.revenue)}
        ${costRow("Poštarina BEX", sum.costs?.shipping, sum.revenue)}
        ${costRow("Pakovanje", sum.costs?.packaging, sum.revenue)}
        ${costRow("Povrati", sum.costs?.refunds, sum.revenue, true)}
        <hr style="border-color:var(--border);margin:12px 0">
        ${costRow("UKUPNI TROŠKOVI", sum.costs?.total, sum.revenue, false, true)}
      </div>`;

    const products = prod.products || [];
    if (productsEl) {
      if (!products.length) {
        productsEl.innerHTML = "<div class='empty-state'><h3>Nema podataka</h3></div>";
        return;
      }
      productsEl.innerHTML = `
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:16px;">📦 Prodaja po proizvodima</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Proizvod</th><th>Kom</th><th>Prihod</th><th>Nabavna cena</th><th>COGS</th><th></th></tr></thead>
              <tbody>${products.map(p=>`
                <tr>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.title}">${p.title}</td>
                  <td>${p.qty}</td>
                  <td style="font-weight:600">${fmtRSD(p.revenue)}</td>
                  <td>${p.cost_rsd?fmtRSD(p.cost_rsd):"<span class='badge badge-red'>Nije uneto</span>"}</td>
                  <td>${p.cost_rsd?fmtRSD(p.cost_rsd*p.qty):"—"}</td>
                  <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="editProductCost('${p.product_id}','${p.title.replace(/'/g,"\'")}',${p.cost_rsd||0})">Unesi cenu</button></td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }
  } catch(e) {
    if (summaryEl) summaryEl.innerHTML = "<p style='color:#ef4444'>Greška.</p>";
  }
};

function costRow(label, value, revenue, isRed=false, isBold=false) {
  const pct = revenue>0&&value ? ((value/revenue)*100).toFixed(1) : "0";
  const col  = isRed?"#ef4444":isBold?"var(--text)":"var(--text2)";
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:13px;color:${col};${isBold?"font-weight:700":""}">${label}</span>
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:11px;color:var(--text3)">${pct}%</span>
      <span style="font-size:13px;font-weight:${isBold?700:500};color:${col}">${fmtRSD(value||0)}</span>
    </div>
  </div>`;
}

window.editProductCost = function(productId, title, currentCost) {
  const cost = prompt(`Nabavna cena za "${title}" (RSD):`, currentCost||"");
  if (cost===null) return;
  const num = parseFloat(cost);
  if (isNaN(num)||num<0) { showToast("Unesi ispravnu cenu","error"); return; }
  fetch("/api/finansije/product-cost",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({shopify_product_id:productId,title,cost_rsd:num})
  }).then(r=>r.json()).then(d=>{
    if(d.success){showToast("Cena sačuvana ✓","success");window.loadFinansije();}
    else showToast(d.error||"Greška","error");
  });
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("finansijePeriod")?.addEventListener("change", window.loadFinansije);
});
