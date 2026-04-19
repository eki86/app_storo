const db = require('../config/db');
const axios = require('axios');
const { getShopifyToken } = require('./settingsController');

function getDateRange(period, dateFrom, dateTo) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  if (period === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
  if (period === 'today') return { from: fmt(now), to: fmt(now) };
  if (period === 'yesterday') { const y = new Date(now); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmt(y) }; }
  if (period === '7d' || period === 'week') { const s = new Date(now); s.setDate(now.getDate() + mondayOffset); return { from: fmt(s), to: fmt(now) }; }
  if (period === '30d') { const s = new Date(now); s.setDate(s.getDate()-29); return { from: fmt(s), to: fmt(now) }; }
  if (period === 'mtd' || period === 'month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
  if (period === 'last_month') { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { from: fmt(s), to: fmt(e) }; }
  return { from: fmt(now), to: fmt(now) };
}

async function getStores(store_id) {
  if (store_id && store_id !== 'all') {
    const [r] = await db.query('SELECT * FROM stores WHERE id=?', [store_id]);
    return r;
  }
  const [r] = await db.query('SELECT * FROM stores');
  return r;
}

async function getFinancialModel() {
  const [[row]] = await db.query('SELECT * FROM financial_model LIMIT 1').catch(() => [[null]]);
  return {
    breakeven_roas: parseFloat(row?.breakeven_roas || 1.5),
    target_margin_rsd: parseFloat(row?.target_margin_rsd || 700),
    max_cpa_rsd: parseFloat(row?.max_cpa_rsd || 500),
    packaging_cost: parseFloat(row?.packaging_cost || 177)
  };
}

function grossPackaging(value, vatIncluded) {
  const num = parseFloat(value || 0);
  return vatIncluded ? num : (num * 1.2);
}

async function syncProductsFromShopify(stores) {
  for (const store of stores) {
    try {
      const token = await getShopifyToken(store);
      if (!token || !store.shopify_url) continue;
      const resp = await axios.get(`https://${store.shopify_url}/admin/api/2025-01/products.json`, {
        headers: { 'X-Shopify-Access-Token': token },
        params: { limit: 250, fields: 'id,title,status,variants' }
      });

      for (const product of (resp.data.products || [])) {
        const variant = (product.variants || [])[0] || {};
        const shopifyProductId = String(product.id);
        const sku = variant.sku || null;
        const price = variant.price != null ? parseFloat(variant.price) : null;

        const [[existing]] = await db.query(
          'SELECT id FROM products WHERE store_id=? AND shopify_product_id=? LIMIT 1',
          [store.id, shopifyProductId]
        ).catch(() => [[null]]);

        if (existing) {
          await db.query(
            `UPDATE products SET sku=?, name=?, shopify_price=?, status=? WHERE id=?`,
            [sku, product.title, price, product.status || 'active', existing.id]
          ).catch(() => {});
        } else {
          await db.query(
            `INSERT INTO products
            (store_id, shopify_product_id, sku, name, shopify_price, purchase_price_vat, packaging_vat, other_costs, max_cpa, target_margin, status)
            VALUES (?,?,?,?,?,?,?, ?,?,?,?)`,
            [store.id, shopifyProductId, sku, product.title, price, 1, 0, 0, 500, 700, product.status || 'active']
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.error('syncProductsFromShopify error:', store.id, e.response?.data || e.message);
    }
  }
}

exports.getSummary = async (req, res) => {
  const { store_id, period = '30d', date_from, date_to } = req.query;
  const { from, to } = getDateRange(period, date_from, date_to);

  try {
    const stores = await getStores(store_id);
    const storeIds = stores.map(s => s.id);
    if (!storeIds.length) return res.json({ revenue: 0, profit: 0, margin: 0, roas: null, orders: 0, costs: { ad_spend: 0, cogs: 0, shipping: 0, packaging: 0, refunds: 0, total: 0 } });

    const placeholders = storeIds.map(() => '?').join(',');

    const [[ordersRow]] = await db.query(
      `SELECT COUNT(*) orders, COALESCE(SUM(total_price),0) revenue
       FROM orders
       WHERE store_id IN (${placeholders}) AND DATE(created_at) BETWEEN ? AND ? AND (financial_status IS NULL OR financial_status NOT IN ('refunded','voided'))`,
      [...storeIds, from, to]
    ).catch(() => [[{ orders: 0, revenue: 0 }]]);

    const [[spendRow]] = await db.query(
      `SELECT COALESCE(SUM(spend),0) spend FROM meta_spend WHERE store_id IN (${placeholders}) AND date BETWEEN ? AND ?`,
      [...storeIds, from, to]
    ).catch(() => [[{ spend: 0 }]]);

    const [[refundRow]] = await db.query(
      `SELECT COALESCE(SUM(total_price),0) refunded FROM orders WHERE store_id IN (${placeholders}) AND DATE(created_at) BETWEEN ? AND ? AND financial_status IN ('refunded','voided')`,
      [...storeIds, from, to]
    ).catch(() => [[{ refunded: 0 }]]);

    const revenue = parseFloat(ordersRow.revenue || 0);
    const adSpend = parseFloat(spendRow.spend || 0);
    const refundAmount = parseFloat(refundRow.refunded || 0);
    const profit = revenue - adSpend - refundAmount;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const roas = adSpend > 0 ? revenue / adSpend : null;

    res.json({
      revenue,
      profit,
      margin,
      roas,
      orders: parseInt(ordersRow.orders || 0, 10),
      costs: { ad_spend: adSpend, cogs: 0, shipping: 0, packaging: 0, refunds: refundAmount, total: adSpend + refundAmount }
    });
  } catch (err) {
    console.error('getSummary error:', err.message);
    res.status(500).json({ error: 'Greška pri kalkulaciji finansija.' });
  }
};

exports.getProductsFinancials = async (req, res) => {
  const { store_id, period = '30d', date_from, date_to } = req.query;
  const { from, to } = getDateRange(period, date_from, date_to);

  try {
    const stores = await getStores(store_id);
    const storeIds = stores.map(s => s.id);
    const model = await getFinancialModel();
    if (!storeIds.length) return res.json({ products: [], defaults: model, vat_rate: 20, range: { from, to } });

    await syncProductsFromShopify(stores);

    const placeholders = storeIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT
        p.id,
        p.store_id,
        p.shopify_product_id,
        p.sku,
        p.name,
        p.shopify_price,
        p.purchase_price,
        p.purchase_price_vat,
        p.packaging_cost,
        p.packaging_vat,
        p.other_costs,
        p.max_cpa,
        p.target_margin,
        p.status,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END),0) qty,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity * oi.price ELSE 0 END),0) revenue,
        MAX(pc.cost_rsd) latest_cost_rsd
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id
        AND o.store_id = p.store_id
        AND DATE(o.created_at) BETWEEN ? AND ?
        AND (o.financial_status IS NULL OR o.financial_status NOT IN ('refunded','voided'))
      LEFT JOIN product_costs pc ON pc.shopify_product_id = p.shopify_product_id
      WHERE p.store_id IN (${placeholders})
      GROUP BY p.id
      ORDER BY p.name ASC`,
      [from, to, ...storeIds]
    ).catch(() => [[]]);

    const products = rows.map(row => {
      const purchase = parseFloat(row.purchase_price ?? row.latest_cost_rsd ?? 0);
      const packaging = parseFloat(row.packaging_cost ?? model.packaging_cost);
      const other = parseFloat(row.other_costs ?? 0);
      const maxCpa = parseFloat(row.max_cpa ?? model.max_cpa_rsd);
      const targetMargin = parseFloat(row.target_margin ?? model.target_margin_rsd);
      const packagingGross = grossPackaging(packaging, Number(row.packaging_vat || 0));
      const cogsUnit = purchase + packagingGross + other;
      const qty = parseFloat(row.qty || 0);
      const revenue = parseFloat(row.revenue || 0);
      const recommendedPrice = purchase + packagingGross + other + maxCpa + targetMargin;
      const profitEstimate = revenue - (cogsUnit * qty);
      const marginPercent = revenue > 0 ? (profitEstimate / revenue) * 100 : null;
      const shopifyPrice = parseFloat(row.shopify_price ?? 0);
      return {
        product_id: row.id,
        store_id: row.store_id,
        shopify_product_id: row.shopify_product_id,
        sku: row.sku,
        title: row.name,
        qty,
        revenue,
        shopify_price: shopifyPrice,
        cost_rsd: purchase,
        purchase_vat_included: Number(row.purchase_price_vat ?? 1),
        packaging_cost_rsd: packaging,
        packaging_vat_included: Number(row.packaging_vat ?? 0),
        extra_cost_rsd: other,
        target_cpa_rsd: maxCpa,
        margin_rsd: targetMargin,
        recommended_price: recommendedPrice,
        cogs_unit: cogsUnit,
        cogs_total: cogsUnit * qty,
        ad_spend: null,
        roas: null,
        profit: profitEstimate,
        margin_percent: marginPercent,
        status: row.status || 'active'
      };
    });

    res.json({ products, defaults: model, vat_rate: 20, range: { from, to } });
  } catch (err) {
    console.error('getProductsFinancials error:', err.message);
    res.status(500).json({ error: 'Greška.' });
  }
};

exports.saveProductCost = async (req, res) => {
  const {
    shopify_product_id, product_id, title, cost_rsd,
    packaging_cost_rsd, extra_cost_rsd, target_cpa_rsd,
    margin_rsd, purchase_vat_included, packaging_vat_included, valid_from
  } = req.body;

  try {
    const [[product]] = await db.query('SELECT * FROM products WHERE id=? OR shopify_product_id=? LIMIT 1', [product_id || 0, shopify_product_id || '']);
    if (!product) return res.status(404).json({ error: 'Proizvod nije pronađen.' });

    await db.query(
      `UPDATE products SET
        purchase_price=?,
        purchase_price_vat=?,
        packaging_cost=?,
        packaging_vat=?,
        other_costs=?,
        max_cpa=?,
        target_margin=?
      WHERE id=?`,
      [
        parseFloat(cost_rsd || 0),
        purchase_vat_included ? 1 : 0,
        parseFloat(packaging_cost_rsd || 0),
        packaging_vat_included ? 1 : 0,
        parseFloat(extra_cost_rsd || 0),
        parseFloat(target_cpa_rsd || 0),
        parseFloat(margin_rsd || 0),
        product.id
      ]
    );

    await db.query(
      'INSERT INTO product_costs (shopify_product_id, title, cost_rsd, valid_from) VALUES (?,?,?,?)',
      [product.shopify_product_id, title || product.name, parseFloat(cost_rsd || 0), valid_from || new Date()]
    ).catch(() => {});

    await db.query(
      'INSERT INTO product_purchase_history (product_id, store_id, purchase_price, note, recorded_at) VALUES (?,?,?,?,?)',
      [product.id, product.store_id, parseFloat(cost_rsd || 0), 'Izmena iz Proizvodi', valid_from || new Date().toISOString().slice(0, 10)]
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('saveProductCost error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getProductCostHistory = async (req, res) => {
  const { store_id } = req.query;
  try {
    const stores = await getStores(store_id);
    const storeIds = stores.map(s => s.id);
    if (!storeIds.length) return res.json({ items: [] });
    const placeholders = storeIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT h.id, h.product_id, p.shopify_product_id, p.name AS title, h.purchase_price AS cost_rsd, h.note, h.recorded_at AS valid_from, h.created_at
       FROM product_purchase_history h
       INNER JOIN products p ON p.id = h.product_id
       WHERE h.store_id IN (${placeholders})
       ORDER BY p.name ASC, h.recorded_at DESC, h.id DESC`,
      storeIds
    ).catch(() => [[]]);
    res.json({ items: rows });
  } catch (err) {
    console.error('getProductCostHistory error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteProductCostHistory = async (req, res) => {
  try {
    await db.query('DELETE FROM product_purchase_history WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProductSalesHistory = async (req, res) => {
  const { store_id } = req.query;
  try {
    const stores = await getStores(store_id);
    const storeIds = stores.map(s => s.id);
    if (!storeIds.length) return res.json({ items: [] });
    const placeholders = storeIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT h.id, h.product_id, p.name AS title, h.price AS price_rsd, h.recorded_at AS captured_at, p.shopify_product_id
       FROM product_price_history h
       INNER JOIN products p ON p.id = h.product_id
       WHERE h.store_id IN (${placeholders})
       ORDER BY p.name ASC, h.recorded_at DESC, h.id DESC`,
      storeIds
    ).catch(() => [[]]);

    const grouped = {};
    for (const row of rows) {
      const pid = String(row.product_id);
      grouped[pid] ||= { product_id: pid, title: row.title, shopify_product_id: row.shopify_product_id, history: [] };
      grouped[pid].history.push(row);
    }

    const items = Object.values(grouped).map(group => {
      const history = group.history.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
      const latest = history[0] || null;
      const previous = history[1] || null;
      const change_percent = latest && previous && Number(previous.price_rsd) !== 0
        ? ((Number(latest.price_rsd) - Number(previous.price_rsd)) / Number(previous.price_rsd)) * 100
        : null;
      return { ...group, latest, previous, change_percent };
    });

    res.json({ items });
  } catch (err) {
    console.error('getProductSalesHistory error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
