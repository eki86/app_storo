const db = require('../config/db');
const { getShopifyToken } = require('./settingsController');
const axios = require('axios');

// ─── KPI: Ad Spend, Prihod, ROAS, Profit, Narudžbine, Povrati
exports.getKPI = async (req, res) => {
  const { store_id, period = 'today' } = req.query;

  const { from, to } = getDateRange(period);

  try {
    const stores = await getStores(store_id);
    if (!stores.length) return res.json({ kpi: emptyKPI() });

    let totalRevenue = 0, totalOrders = 0, totalRefunds = 0;

    for (const store of stores) {
      try {
        const token = await getShopifyToken(store);
        if (!token) continue;

        // Narudžbine
        const ordersResp = await axios.get(
          `https://${store.shopify_url}/admin/api/2024-01/orders.json`,
          {
            headers: { 'X-Shopify-Access-Token': token },
            params: {
              status: 'any',
              created_at_min: from,
              created_at_max: to,
              limit: 250,
              fields: 'id,total_price,financial_status,refunds'
            }
          }
        );

        const orders = ordersResp.data.orders || [];
        for (const o of orders) {
          const price = parseFloat(o.total_price || 0);
          totalRevenue += price;
          totalOrders++;
          if (o.financial_status === 'refunded' || o.financial_status === 'partially_refunded') {
            totalRefunds++;
          }
        }
      } catch (e) {
        console.error('Shopify fetch error za store', store.id, e.message);
      }
    }

    // Meta spend iz baze (ako je upisano)
    const [[spendRow]] = await db.query(
      `SELECT COALESCE(SUM(spend), 0) as spend FROM meta_spend WHERE store_id IN (${stores.map(() => '?').join(',')}) AND date BETWEEN ? AND DATE(?)`,
      [...stores.map(s => s.id), from.substring(0, 10), to.substring(0, 10)]
    ).catch(() => [[{ spend: 0 }]]);

    const adSpend = parseFloat(spendRow?.spend || 0);
    const roas = adSpend > 0 ? totalRevenue / adSpend : null;
    // Gruba procena profita — bez troškova proizvoda za sad
    const profit = null; // Biće dostupan kada dodamo troškove

    res.json({
      kpi: {
        ad_spend: adSpend,
        revenue: totalRevenue,
        roas: roas,
        profit: profit,
        orders: totalOrders,
        refunds: totalRefunds,
        period,
        from,
        to
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška pri kalkulaciji KPI.' });
  }
};

// ─── Chart: prihod po danima
exports.getChart = async (req, res) => {
  const { store_id, period = '30d' } = req.query;
  const { from, to } = getDateRange(period);

  try {
    const stores = await getStores(store_id);
    const dayMap = {};

    for (const store of stores) {
      try {
        const token = await getShopifyToken(store);
        if (!token) continue;

        let page_info = null;
        let hasMore = true;

        while (hasMore) {
          const params = {
            status: 'any',
            created_at_min: from,
            created_at_max: to,
            limit: 250,
            fields: 'id,total_price,created_at'
          };
          if (page_info) params.page_info = page_info;

          const resp = await axios.get(
            `https://${store.shopify_url}/admin/api/2024-01/orders.json`,
            { headers: { 'X-Shopify-Access-Token': token }, params }
          );

          const orders = resp.data.orders || [];
          orders.forEach(o => {
            const day = o.created_at.substring(0, 10);
            dayMap[day] = (dayMap[day] || 0) + parseFloat(o.total_price || 0);
          });

          // Pagination
          const link = resp.headers['link'] || '';
          const nextMatch = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
          if (nextMatch) { page_info = nextMatch[1]; }
          else { hasMore = false; }
          if (orders.length < 250) hasMore = false;
        }
      } catch (e) {
        console.error('Chart fetch error', e.message);
      }
    }

    const labels = Object.keys(dayMap).sort();
    const values = labels.map(d => Math.round(dayMap[d]));

    res.json({ labels, values });
  } catch (err) {
    res.status(500).json({ error: 'Greška pri učitavanju grafa.' });
  }
};

// ─── Helpers
function getDateRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00:00`;
  const fmtEnd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T23:59:59`;

  if (period === 'today') {
    return { from: fmt(now), to: fmtEnd(now) };
  }
  if (period === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: fmt(y), to: fmtEnd(y) };
  }
  if (period === '7d') {
    const s = new Date(now); s.setDate(s.getDate() - 6);
    return { from: fmt(s), to: fmtEnd(now) };
  }
  if (period === '30d') {
    const s = new Date(now); s.setDate(s.getDate() - 29);
    return { from: fmt(s), to: fmtEnd(now) };
  }
  if (period === 'mtd') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(s), to: fmtEnd(now) };
  }
  if (period === 'last_month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(s), to: fmtEnd(e) };
  }
  // Default — today
  return { from: fmt(now), to: fmtEnd(now) };
}

async function getStores(store_id) {
  if (store_id && store_id !== 'all') {
    const [rows] = await db.query('SELECT * FROM stores WHERE id=?', [store_id]);
    return rows;
  }
  const [rows] = await db.query('SELECT * FROM stores');
  return rows;
}

function emptyKPI() {
  return { ad_spend: null, revenue: null, roas: null, profit: null, orders: null, refunds: null };
}
