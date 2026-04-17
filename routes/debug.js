const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const db      = require('../config/db');
const axios   = require('axios');

// GET /api/debug/shopify/:store_id
// Privremeni endpoint za dijagnostiku — obriši nakon testiranja
router.get('/shopify/:store_id', auth, async (req, res) => {
  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [req.params.store_id]);
    if (!store) return res.json({ error: 'Store not found' });

    const token = store.shopify_access_token;
    const url   = store.shopify_url;

    res.json({
      store_id:    store.id,
      shopify_url: url,
      has_token:   !!token,
      token_start: token ? token.substring(0, 8) + '...' : null,
    });

    // Ne pozivamo Shopify ovdje — samo provjeravamo šta imamo u bazi
  } catch (e) {
    res.json({ error: e.message });
  }
});

// GET /api/debug/shopify-test/:store_id
// Stvarni API poziv sa detaljnom greškom
router.get('/shopify-test/:store_id', auth, async (req, res) => {
  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [req.params.store_id]);
    if (!store) return res.json({ error: 'Store not found' });

    const token = store.shopify_access_token;
    const url   = store.shopify_url;

    if (!token) return res.json({ error: 'Nema tokena u bazi' });

    // Pokušaj sa različitim API verzijama
    const versions = ['2025-01', '2024-10', '2024-07', '2024-01'];
    const results  = {};

    for (const v of versions) {
      try {
        const r = await axios.get(
          `https://${url}/admin/api/${v}/shop.json`,
          {
            headers: { 'X-Shopify-Access-Token': token },
            timeout: 8000,
            validateStatus: null // ne baci exception za 4xx/5xx
          }
        );
        results[v] = {
          status: r.status,
          ok:     r.status === 200,
          data:   r.status === 200 ? r.data?.shop?.name : r.data
        };
      } catch (e) {
        results[v] = {
          status: 'EXCEPTION',
          error:  e.code || e.message
        };
      }
    }

    res.json({ shopify_url: url, versions: results });
  } catch (e) {
    res.json({ error: e.message, stack: e.stack?.split('\n').slice(0,3) });
  }
});

module.exports = router;
