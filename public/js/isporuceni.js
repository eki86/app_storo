window.loadIsporuceni = async function() {
  const storeId = window.currentStoreId || "all";
  const period  = document.getElementById("isporuceniPeriod")?.value || "30d";
  const tbody   = document.getElementById("isporuceniTbody");
  const statsEl = document.getElementById("isporuceniStats");

  if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">Učitavam...</td></tr>`;

  try {
    const res = await fetch(`/api/orders?store_id=${storeId}&period=${period}&limit=200`);
    const { orders } = await res.json();
    const fulfilled = (orders||[]).filter(o => o.fulfillment_status === "fulfilled");
    const pending   = (orders||[]).filter(o => o.fulfillment_status !== "fulfilled");

    if (statsEl) statsEl.innerHTML = [
      ["Isporučeno", fulfilled.length, "#22c55e"],
      ["Na čekanju", pending.length, "#f59e0b"],
      ["Ukupno narudžbina", (orders||[]).length, ""],
    ].map(([label,val,col])=>`
      <div class="kpi-card" style="padding:12px 16px;">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value" style="font-size:20px;${col?`color:${col}`:""}">${val}</div>
      </div>`).join("");

    if (!orders?.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">Nema narudžbina.</td></tr>`;
      return;
    }

    tbody.innerHTML = [...pending, ...fulfilled].map(o => {
      const isPending = o.fulfillment_status !== "fulfilled";
      return `<tr>
        <td style="font-weight:600">${o.name}</td>
        <td>${o.store_name}</td>
        <td>${new Date(o.created_at).toLocaleDateString("sr-RS")}</td>
        <td>${o.customer}</td>
        <td>${o.items_count} kom</td>
        <td style="font-weight:600">${fmtRSD(o.total_price)}</td>
        <td><span class="badge ${isPending?"badge-yellow":"badge-green"}">${isPending?"Na čekanju":"Isporučeno"}</span></td>
      </tr>`;
    }).join("");
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#ef4444">Greška.</td></tr>`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("isporuceniPeriod")?.addEventListener("change", window.loadIsporuceni);
});
