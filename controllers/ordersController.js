const db = require('../config/db');
const axios = require('axios');
const { getShopifyToken } = require('./settingsController');

async function getStores(store_id) {
  if (store_id && store_id !== 'all') {
    const [r] = await db.query('SELECT * FROM stores WHERE id=?', [store_id]);
    return r;
  }
  const [r] = await db.query('SELECT * FROM stores');
  return r;
}

function getDateRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt    = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00:00`;
  const fmtEnd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T23:59:59`;
  if (period === 'today')        return { from: fmt(now), to: fmtEnd(now) };
  if (period === 'yesterday')    { const y = new Date(now); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmtEnd(y) }; }
  if (period === '7d')           { const s = new Date(now); s.setDate(s.getDate()-6); return { from: fmt(s), to: fmtEnd(now) }; }
  if (period === '30d')          { const s = new Date(now); s.setDate(s.getDate()-29); return { from: fmt(s), to: fmtEnd(now) }; }
  if (period === 'mtd')          { return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtEnd(now) }; }
  if (period === 'last_month')   { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { from: fmt(s), to: fmtEnd(e) }; }
  return { from: fmt(now), to: fmtEnd(now) };
}

exports.getOrders = async (req, res) => {
  const { store_id, period = '30d', page = 1, limit = 50 } = req.query;
  const { from, to } = getDateRange(period);

  try {
    const stores = await getStores(store_id);
    let allOrders = [];

    for (const store of stores) {
      const token = await getShopifyToken(store);
      if (!token) continue;

      const resp = await axios.get(`https://${store.shopify_url}/admin/api/2024-01/orders.json`, {
        headers: { 'X-Shopify-Access-Token': token },
        params: {
          status: 'any',
          created_at_min: from,
          created_at_max: to,
          limit: 250,
          fields: 'id,name,created_at,total_price,financial_status,fulfillment_status,customer,line_items,shipping_lines,refunds'
        }
      });

      const orders = (resp.data.orders || []).map(o => ({
        id:                 o.id,
        name:               o.name,
        store_name:         store.name,
        created_at:         o.created_at,
        total_price:        parseFloat(o.total_price || 0),
        financial_status:   o.financial_status,
        fulfillment_status: o.fulfillment_status || 'unfulfilled',
        customer:           o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'N/A',
        items_count:        (o.line_items || []).reduce((s, i) => s + i.quantity, 0),
        shipping:           parseFloat((o.shipping_lines?.[0]?.price) || 0),
        is_refunded:        o.financial_status === 'refunded' || o.financial_status === 'partially_refunded'
      }));

      allOrders = allOrders.concat(orders);
    }

    // Sort by date desc
    allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = allOrders.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paged  = allOrders.slice(offset, offset + parseInt(limit));

    res.json({ orders: paged, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getOrders error:', err.message);
    res.status(500).json({ error: 'Greška pri učitavanju narudžbina.' });
  }
};

exports.getStats = async (req, res) => {
  const { store_id, period = '30d' } = req.query;
  const { from, to } = getDateRange(period);

  try {
    const stores = await getStores(store_id);
    let total = 0, revenue = 0, refunds = 0, fulfilled = 0, pending = 0;

    for (const store of stores) {
      const token = await getShopifyToken(store);
      if (!token) continue;

      const resp = await axios.get(`https://${store.shopify_url}/admin/api/2024-01/orders.json`, {
        headers: { 'X-Shopify-Access-Token': token },
        params: { status: 'any', created_at_min: from, created_at_max: to, limit: 250, fields: 'id,total_price,financial_status,fulfillment_status' }
      });

      for (const o of (resp.data.orders || [])) {
        total++;
        revenue += parseFloat(o.total_price || 0);
        if (o.financial_status === 'refunded' || o.financial_status === 'partially_refunded') refunds++;
        if (o.fulfillment_status === 'fulfilled') fulfilled++;
        else pending++;
      }
    }

    res.json({ total, revenue, refunds, fulfilled, pending, avg_order: total > 0 ? revenue / total : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Greška.' });
  }
};
