const db = require('../config/db');
const axios = require('axios');

exports.getStores = async (req, res) => {
  try {
    const [stores] = await db.query(
      `SELECT id, name, shopify_url, shopify_client_id, meta_ad_account_id,
              shopify_token_status, shopify_token_expires,
              CASE WHEN shopify_access_token IS NOT NULL AND shopify_access_token != '' THEN 1 ELSE 0 END as has_shopify_token,
              CASE WHEN meta_access_token IS NOT NULL AND meta_access_token != '' THEN 1 ELSE 0 END as has_meta_token
       FROM stores ORDER BY id`
    );
    res.json({ stores });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

exports.saveStore = async (req, res) => {
  const {
    id, name, shopify_url,
    shopify_client_id, shopify_client_secret,
    meta_access_token, meta_ad_account_id
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Naziv je obavezan' });

  try {
    if (id) {
      // UPDATE — samo polja koja su poslata (ne brišemo tokene!)
      const updates = ['name = ?', 'shopify_url = ?', 'meta_ad_account_id = ?'];
      const values  = [name, shopify_url || '', meta_ad_account_id || ''];

      if (shopify_client_id)     { updates.push('shopify_client_id = ?');     values.push(shopify_client_id); }
      if (shopify_client_secret) { updates.push('shopify_client_secret = ?'); values.push(shopify_client_secret); }
      if (meta_access_token)     { updates.push('meta_access_token = ?');     values.push(meta_access_token); }

      values.push(id);
      await db.query(`UPDATE stores SET ${updates.join(', ')} WHERE id = ?`, values);
    } else {
      // INSERT nova prodavnica
      await db.query(
        `INSERT INTO stores (name, shopify_url, shopify_client_id, shopify_client_secret, meta_access_token, meta_ad_account_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, shopify_url || '', shopify_client_id || '', shopify_client_secret || '', meta_access_token || '', meta_ad_account_id || '']
      );
    }
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteStore = async (req, res) => {
  try {
    await db.query('DELETE FROM stores WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

exports.testShopify = async (req, res) => {
  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [req.params.id]);
    if (!store) return res.status(404).json({ error: 'Prodavnica nije pronađena' });

    const token = await getShopifyToken(store);
    if (!token) return res.status(400).json({ error: 'Nema tokena. Unesi Client ID i Secret.' });

    const resp = await axios.get(`https://${store.shopify_url}/admin/api/2025-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token }
    });

    await db.query(
      "UPDATE stores SET shopify_token_status='connected', shopify_token_expires=DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id=?",
      [store.id]
    );

    res.json({ success: true, shop: resp.data.shop.name });
  } catch(e) {
    res.status(500).json({ error: e.response?.data?.errors || e.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [req.params.id]);
    if (!store) return res.status(404).json({ error: 'Prodavnica nije pronađena' });

    const token = await getShopifyToken(store);
    if (token) {
      await db.query(
        "UPDATE stores SET shopify_token_status='connected', shopify_token_expires=DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id=?",
        [store.id]
      );
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Nema tokena za refresh' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

async function getShopifyToken(store) {
  // Uvijek pokušaj refresh ako ima client_id i client_secret
  // Token ističe za 24h, pa ga uvijek osvježavamo
  if (store.shopify_client_id && store.shopify_client_secret) {
    try {
      const resp = await axios.post(
        `https://${store.shopify_url}/admin/oauth/access_token`,
        {
          client_id:     store.shopify_client_id,
          client_secret: store.shopify_client_secret,
          grant_type:    'client_credentials'
        }
      );
      const token = resp.data.access_token;
      if (token) {
        await db.query(
          "UPDATE stores SET shopify_access_token=?, shopify_token_status='connected', shopify_token_expires=DATE_ADD(NOW(), INTERVAL 23 HOUR) WHERE id=?",
          [token, store.id]
        );
        return token;
      }
    } catch(e) {
      console.error('OAuth refresh greška za store', store.id, e.response?.data || e.message);
      // Ako refresh ne uspije, pokušaj sa starim tokenom
      if (store.shopify_access_token) return store.shopify_access_token;
      return null;
    }
  }

  // Nema client credentials — vrati stari token ako postoji
  if (store.shopify_access_token) return store.shopify_access_token;
  return null;
}


// Direktno upisivanje access tokena (za slučaj ručnog unosa)
exports.saveToken = async (req, res) => {
  const { shopify_access_token, shopify_client_id, shopify_client_secret } = req.body;
  try {
    const updates = [];
    const values  = [];
    if (shopify_access_token)  { updates.push('shopify_access_token = ?');  values.push(shopify_access_token); }
    if (shopify_client_id)     { updates.push('shopify_client_id = ?');     values.push(shopify_client_id); }
    if (shopify_client_secret) { updates.push('shopify_client_secret = ?'); values.push(shopify_client_secret); }
    if (!updates.length) return res.status(400).json({ error: 'Nema podataka za upis' });
    values.push(req.params.id);
    await db.query(`UPDATE stores SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports.getShopifyToken = getShopifyToken;
