const db = require('../config/db');
const axios = require('axios');
const { getShopifyToken } = require('./settingsController');

function getDateRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt    = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00:00`;
  const fmtEnd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T23:59:59`;
  if (period === 'today')      return { from: fmt(now), to: fmtEnd(now) };
  if (period === 'yesterday')  { const y = new Date(now); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmtEnd(y) }; }
  if (period === '7d')         { const s = new Date(now); s.setDate(s.getDate()-6); return { from: fmt(s), to: fmtEnd(now) }; }
  if (period === '30d')        { const s = new Date(now); s.setDate(s.getDate()-29); return { from: fmt(s), to: fmtEnd(now) }; }
  if (period === 'mtd')        { return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtEnd(now) }; }
  if (period === 'last_month') { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { from: fmt(s), to: fmtEnd(e) }; }
  return { from: fmt(now), to: fmtEnd(now) };
}

async function getStores(store_id) {
  if (store_id && store_id !== 'all') {
    const [r] = await db.query('SELECT * FROM stores WHERE id=?', [store_id]);
    return r;
  }
  const [r] = await db.query('SELECT * FROM stores');
  return r;
}

exports.getSummary = async (req, res) => {
  const { store_id, period = '30d' } = req.query;
  const { from, to } = getDateRange(period);

  try {
    const stores = await getStores(store_id);
    let revenue = 0, totalCOGS = 0, totalShipping = 0, totalPackaging = 0, orders = 0, refundAmount = 0;

    // Default model iz settings
    const [[model]] = await db.query('SELECT * FROM financial_model LIMIT 1').catch(() => [[null]]);
    const defaultPackaging = model?.packaging_cost || 177;
    const bexPrice = await getBexPrice();

    for (const store of stores) {
      const token = await getShopifyToken(store);
      if (!token) continue;

      const resp = await axios.get(`https://${store.shopify_url}/admin/api/2025-01/orders.json`, {
        headers: { 'X-Shopify-Access-Token': token },
        params: {
          status: 'any',
          created_at_min: from,
          created_at_max: to,
          limit: 250,
          fields: 'id,total_price,line_items,financial_status,refunds'
        }
      });

      for (const o of (resp.data.orders || [])) {
        const price = parseFloat(o.total_price || 0);
        revenue += price;
        orders++;
        totalPackaging += defaultPackaging;
        totalShipping  += bexPrice;

        // COGS po proizvodu
        for (const item of (o.line_items || [])) {
          const [[pc]] = await db.query(
            'SELECT cost_rsd FROM product_costs WHERE shopify_product_id=? ORDER BY valid_from DESC LIMIT 1',
            [String(item.product_id)]
          ).catch(() => [[null]]);
          if (pc) totalCOGS += (pc.cost_rsd || 0) * item.quantity;
        }

        // Refundi
        if (o.financial_status === 'refunded') {
          refundAmount += price;
        }
      }
    }

    // Meta spend
    const [[spendRow]] = await db.query(
      `SELECT COALESCE(SUM(spend), 0) as spend FROM meta_spend WHERE store_id IN (${stores.map(() => '?').join(',')}) AND date BETWEEN ? AND DATE(?)`,
      [...stores.map(s => s.id), from.substring(0, 10), to.substring(0, 10)]
    ).catch(() => [[{ spend: 0 }]]);

    const adSpend = parseFloat(spendRow?.spend || 0);
    const totalCosts = totalCOGS + totalShipping + totalPackaging + adSpend + refundAmount;
    const profit = revenue - totalCosts;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const roas   = adSpend > 0 ? revenue / adSpend : null;

    res.json({
      revenue, profit, margin, roas, orders,
      costs: {
        ad_spend:   adSpend,
        cogs:       totalCOGS,
        shipping:   totalShipping,
        packaging:  totalPackaging,
        refunds:    refundAmount,
        total:      totalCosts
      }
    });
  } catch (err) {
    console.error('getSummary error:', err.message);
    res.status(500).json({ error: 'Greška pri kalkulaciji finansija.' });
  }
};

exports.getProductsFinancials = async (req, res) => {
  const { store_id, period = '30d' } = req.query;
  const { from, to } = getDateRange(period);

  try {
    const stores = await getStores(store_id);
    const productMap = {};

    for (const store of stores) {
      const token = await getShopifyToken(store);
      if (!token) continue;

      const resp = await axios.get(`https://${store.shopify_url}/admin/api/2025-01/orders.json`, {
        headers: { 'X-Shopify-Access-Token': token },
        params: { status: 'any', created_at_min: from, created_at_max: to, limit: 250, fields: 'id,line_items,financial_status' }
      });

      for (const o of (resp.data.orders || [])) {
        if (o.financial_status === 'refunded') continue;
        for (const item of (o.line_items || [])) {
          const pid = String(item.product_id);
          if (!productMap[pid]) {
            productMap[pid] = { product_id: pid, title: item.title, qty: 0, revenue: 0, cost_rsd: null };
          }
          productMap[pid].qty     += item.quantity;
          productMap[pid].revenue += parseFloat(item.price || 0) * item.quantity;
        }
      }
    }

    // Dodaj troškove
    for (const pid of Object.keys(productMap)) {
      const [[pc]] = await db.query(
        'SELECT cost_rsd FROM product_costs WHERE shopify_product_id=? ORDER BY valid_from DESC LIMIT 1', [pid]
      ).catch(() => [[null]]);
      if (pc) productMap[pid].cost_rsd = pc.cost_rsd;
    }

    const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Greška.' });
  }
};

exports.saveProductCost = async (req, res) => {
  const { shopify_product_id, title, cost_rsd, valid_from } = req.body;
  try {
    await db.query(
      'INSERT INTO product_costs (shopify_product_id, title, cost_rsd, valid_from) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE cost_rsd=?, valid_from=?',
      [shopify_product_id, title, cost_rsd, valid_from || new Date(), cost_rsd, valid_from || new Date()]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function getBexPrice() {
  const [[row]] = await db.query(
    'SELECT price_no_vat FROM bex_prices ORDER BY valid_from DESC LIMIT 1'
  ).catch(() => [[null]]);
  if (!row) return 250; // default
  return parseFloat(row.price_no_vat) * 1.2; // sa PDV
}
