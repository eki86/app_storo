window.loadProizvodi = async function() {
  const storeId = window.currentStoreId || "all";
  const period  = document.getElementById("proizvodiPeriod")?.value || "30d";
  const tbody   = document.getElementById("proizvodiTbody");

  if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">Učitavam...</td></tr>`;

  try {
    const res = await fetch(`/api/finansije/products?store_id=${storeId}&period=${period}`);
    const { products } = await res.json();

    if (!products?.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">Nema podataka.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map((p,i)=>`
      <tr>
        <td>${i+1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.title}">${p.title}</td>
        <td>${p.qty}</td>
        <td style="font-weight:600">${fmtRSD(p.revenue)}</td>
        <td>${p.cost_rsd?fmtRSD(p.cost_rsd*p.qty):"<span class='badge badge-red'>Nije uneto</span>"}</td>
        <td>
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="editProductCost('${p.product_id}','${p.title.replace(/'/g,"\'")}',${p.cost_rsd||0})">
            ${p.cost_rsd?"Izmeni cenu":"Unesi cenu"}
          </button>
        </td>
      </tr>`).join("");
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#ef4444">Greška.</td></tr>`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("proizvodiPeriod")?.addEventListener("change", window.loadProizvodi);
});
