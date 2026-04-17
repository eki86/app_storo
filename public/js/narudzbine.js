window.loadNarudzbine = async function() {
  const storeId = window.currentStoreId || "all";
  const period  = document.getElementById("narudzbinePeriod")?.value || "30d";
  const tbody   = document.getElementById("narudzbineTbody");
  const statsEl = document.getElementById("narudzbineStats");

  if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Učitavam...</td></tr>`;

  try {
    const [ordRes, stRes] = await Promise.all([
      fetch(`/api/orders?store_id=${storeId}&period=${period}&limit=100`),
      fetch(`/api/orders/stats?store_id=${storeId}&period=${period}`)
    ]);
    const { orders } = await ordRes.json();
    const st = await stRes.json();

    if (statsEl) statsEl.innerHTML = [
      ["Ukupno", st.total || 0],
      ["Prihod", fmtRSD(st.revenue)],
      ["Prosek", fmtRSD(st.avg_order)],
      ["Isporučeno", st.fulfilled || 0],
      ["Na čekanju", st.pending || 0],
      ["Povrati", st.refunds || 0],
    ].map(([label, val], i) => `
      <div class="kpi-card" style="padding:12px 16px;">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value" style="font-size:20px;${i===5?'color:#ef4444':''}">${val}</div>
      </div>`).join("");

    if (!orders?.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nema narudžbina.</td></tr>`;
      return;
    }

    const fin = { paid:"badge-green", pending:"badge-yellow", refunded:"badge-red", partially_refunded:"badge-yellow", voided:"badge-gray" };
    const ful = { fulfilled:"badge-green", unfulfilled:"badge-yellow", partial:"badge-yellow", restocked:"badge-gray" };
    const finLabel = { paid:"Plaćeno", pending:"Na čekanju", refunded:"Refundovano", partially_refunded:"Delimičan refund", voided:"Poništeno" };
    const fulLabel = { fulfilled:"Isporučeno", unfulfilled:"Na čekanju", partial:"Delimično", restocked:"Vraćeno" };

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td style="font-weight:600">${o.name}</td>
        <td>${o.store_name}</td>
        <td>${new Date(o.created_at).toLocaleDateString("sr-RS")}</td>
        <td>${o.customer}</td>
        <td>${o.items_count} kom</td>
        <td style="font-weight:600">${fmtRSD(o.total_price)}</td>
        <td><span class="badge ${fin[o.financial_status]||'badge-gray'}">${finLabel[o.financial_status]||o.financial_status}</span></td>
        <td><span class="badge ${ful[o.fulfillment_status]||'badge-gray'}">${fulLabel[o.fulfillment_status]||o.fulfillment_status}</span></td>
      </tr>`).join("");
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#ef4444">Greška pri učitavanju.</td></tr>`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("narudzbinePeriod")?.addEventListener("change", window.loadNarudzbine);
});
