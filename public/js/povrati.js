window.loadPovrati = async function() {
  const storeId = window.currentStoreId || "all";
  const period  = document.getElementById("povratiPeriod")?.value || "30d";
  const tbody   = document.getElementById("povratiTbody");
  const statsEl = document.getElementById("povratiStats");

  if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">Učitavam...</td></tr>`;

  try {
    const res = await fetch(`/api/orders?store_id=${storeId}&period=${period}&limit=250`);
    const { orders } = await res.json();
    const refunds = (orders||[]).filter(o => o.financial_status === "refunded" || o.financial_status === "partially_refunded");
    const totalRefundVal = refunds.reduce((s,o)=>s+o.total_price,0);

    if (statsEl) statsEl.innerHTML = [
      ["Broj povrata", refunds.length, "#ef4444"],
      ["Vrednost povrata", fmtRSD(totalRefundVal), "#ef4444"],
      ["% od narudžbina", orders?.length ? ((refunds.length/orders.length)*100).toFixed(1)+"%" : "—", ""],
    ].map(([label,val,col])=>`
      <div class="kpi-card" style="padding:12px 16px;">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value" style="font-size:20px;${col?`color:${col}`:""}">${val}</div>
      </div>`).join("");

    if (!refunds.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">Nema povrata u ovom periodu 🎉</td></tr>`;
      return;
    }

    tbody.innerHTML = refunds.map(o=>`
      <tr>
        <td style="font-weight:600">${o.name}</td>
        <td>${o.store_name}</td>
        <td>${new Date(o.created_at).toLocaleDateString("sr-RS")}</td>
        <td>${o.customer}</td>
        <td style="font-weight:600;color:#ef4444">${fmtRSD(o.total_price)}</td>
        <td><span class="badge badge-red">${o.financial_status==="refunded"?"Pun povrat":"Delimičan povrat"}</span></td>
      </tr>`).join("");
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#ef4444">Greška.</td></tr>`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("povratiPeriod")?.addEventListener("change", window.loadPovrati);
});
