const db   = require('../config/db');
const axios = require('axios');

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getStores(store_id) {
  if (store_id && store_id !== 'all') {
    const [r] = await db.query('SELECT * FROM stores WHERE id = ?', [store_id]);
    return r;
  }
  const [r] = await db.query('SELECT * FROM stores');
  return r;
}

function getDateRange(period, from_custom, to_custom) {
  if (period === 'custom' && from_custom && to_custom) {
    return { from: from_custom, to: to_custom };
  }
  const now = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  if (period === 'today') return { from: today, to: today };
  if (period === '7d')  { const s = new Date(now); s.setDate(s.getDate()-6); return { from: fmt(s), to: today }; }
  if (period === '30d') { const s = new Date(now); s.setDate(s.getDate()-29); return { from: fmt(s), to: today }; }
  if (period === 'mtd') { return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }; }
  const s = new Date(now); s.setDate(s.getDate()-29);
  return { from: fmt(s), to: today };
}

// Izvlači SKU iz naziva kreative: naziv_SKU_001_copy → SKU
function extractSku(name) {
  if (!name) return null;
  const parts = name.split('_');
  if (parts.length >= 2) return parts[1];
  return null;
}

// Meta API poziv sa retry na rate limit
async function metaGet(url, params, token) {
  const resp = await axios.get(url, {
    params: { ...params, access_token: token },
    timeout: 15000
  });
  return resp.data;
}

// ─── GET /api/creatives ───────────────────────────────────────────────────────
// Vraća kreative iz baze + live Meta Ads podatke za izabrani period
exports.getCreatives = async (req, res) => {
  const { store_id, period = '30d', from, to } = req.query;
  const { from: dateFrom, to: dateTo } = getDateRange(period, from, to);

  try {
    const stores = await getStores(store_id);
    let allCreatives = [];

    for (const store of stores) {
      if (!store.meta_access_token || !store.meta_ad_account_id) continue;

      try {
        // Fetch insights za sve ads za dati period
        const insightsUrl = `https://graph.facebook.com/v19.0/act_${store.meta_ad_account_id}/ads`;
        const data = await metaGet(insightsUrl, {
          fields: [
            'id', 'name', 'status', 'adset_id', 'campaign_id',
            'insights.date_preset(last_30d){spend,impressions,clicks,ctr,frequency,actions,purchase_roas,date_start,date_stop}'
          ].join(','),
          limit: 500
        }, store.meta_access_token);

        // Ako je custom period, koristimo time_range parametar za insights
        let adsWithInsights = [];
        if (period === 'custom' || ['today','7d','30d','mtd'].includes(period)) {
          // Za custom period — poseban insights poziv
          const insightsCustom = await metaGet(
            `https://graph.facebook.com/v19.0/act_${store.meta_ad_account_id}/insights`,
            {
              level: 'ad',
              fields: 'ad_id,ad_name,spend,impressions,clicks,ctr,frequency,actions,purchase_roas,adset_id,campaign_id',
              time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
              limit: 500
            },
            store.meta_access_token
          );

          const insightMap = {};
          (insightsCustom.data || []).forEach(i => {
            insightMap[i.ad_id] = i;
          });

          // Lista svih ads sa statusom
          const adsData = await metaGet(
            `https://graph.facebook.com/v19.0/act_${store.meta_ad_account_id}/ads`,
            {
              fields: 'id,name,status,adset_id,campaign_id,created_time',
              limit: 500
            },
            store.meta_access_token
          );

          adsWithInsights = (adsData.data || []).map(ad => {
            const ins = insightMap[ad.id] || {};
            return buildCreativeRow(ad, ins, store, dateFrom, dateTo);
          });
        }

        allCreatives = [...allCreatives, ...adsWithInsights];
      } catch (e) {
        console.error('Meta API greška za store', store.id, e.response?.data || e.message);
        // Nastavi sa ostalim prodavnicama
      }
    }

    // Spoji sa podacima iz baze (action_log)
    if (allCreatives.length > 0) {
      const adIds = allCreatives.map(c => c.ad_id).filter(Boolean);
      if (adIds.length > 0) {
        const placeholders = adIds.map(() => '?').join(',');
        const [logs] = await db.query(
          `SELECT ad_id, action, note, created_at FROM action_log WHERE ad_id IN (${placeholders}) ORDER BY created_at DESC`,
          adIds
        ).catch(() => [[]]);

        const logMap = {};
        logs.forEach(l => { if (!logMap[l.ad_id]) logMap[l.ad_id] = l; });
        allCreatives = allCreatives.map(c => ({
          ...c,
          last_action: logMap[c.ad_id] || null
        }));
      }
    }

    // Meta dugovanje — spend od poslednje naplate
    let totalDugovanje = 0;
    for (const store of stores) {
      if (!store.meta_access_token || !store.meta_ad_account_id) continue;
      try {
        const billing = await metaGet(
          `https://graph.facebook.com/v19.0/act_${store.meta_ad_account_id}`,
          { fields: 'amount_spent,currency,spend_cap' },
          store.meta_access_token
        );
        totalDugovanje += parseFloat(billing.amount_spent || 0) / 100;
      } catch (e) { /* ignore */ }
    }

    res.json({
      creatives: allCreatives,
      period: { from: dateFrom, to: dateTo },
      meta_dugovanje: totalDugovanje
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška pri učitavanju kreativa.' });
  }
};

function buildCreativeRow(ad, ins, store, dateFrom, dateTo) {
  const spend       = parseFloat(ins.spend || 0);
  const impressions = parseInt(ins.impressions || 0);
  const clicks      = parseInt(ins.clicks || 0);
  const ctr         = parseFloat(ins.ctr || 0);
  const frequency   = parseFloat(ins.frequency || 0);

  let purchases = 0, addToCart = 0;
  (ins.actions || []).forEach(a => {
    if (a.action_type === 'purchase') purchases += parseInt(a.value || 0);
    if (a.action_type === 'add_to_cart') addToCart += parseInt(a.value || 0);
  });

  let roas = null;
  if (ins.purchase_roas && ins.purchase_roas.length > 0) {
    roas = parseFloat(ins.purchase_roas[0].value || 0);
  } else if (spend > 0 && purchases > 0) {
    roas = null; // Bez prihoda, ne možemo kalkulisati
  }

  const sku = extractSku(ad.name);

  // Izračunaj broj dana aktivan (od created_time do danas)
  let danaAktivan = 0;
  if (ad.created_time) {
    const created = new Date(ad.created_time);
    const now = new Date();
    danaAktivan = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
  }

  return {
    ad_id:        ad.id,
    adset_id:     ad.adset_id,
    campaign_id:  ad.campaign_id,
    store_id:     store.id,
    store_name:   store.name,
    name:         ad.name,
    sku,
    status:       ad.status, // ACTIVE, PAUSED, ARCHIVED, DELETED
    spend,
    roas,
    ctr,
    frequency,
    impressions,
    purchases,
    add_to_cart:  addToCart,
    dana_aktivan: danaAktivan,
    created_time: ad.created_time,
    date_from:    dateFrom,
    date_to:      dateTo
  };
}

// ─── POST /api/creatives/budget ───────────────────────────────────────────────
// Menjanje budžeta na Ad Setu
exports.setBudget = async (req, res) => {
  const { store_id, adset_id, daily_budget, lifetime_budget, note } = req.body;
  if (!store_id || !adset_id) return res.status(400).json({ error: 'store_id i adset_id su obavezni.' });

  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [store_id]);
    if (!store?.meta_access_token) return res.status(400).json({ error: 'Nema Meta tokena za ovu prodavnicu.' });

    const params = {};
    if (daily_budget)    params.daily_budget    = Math.round(parseFloat(daily_budget) * 100); // Meta koristi cente
    if (lifetime_budget) params.lifetime_budget = Math.round(parseFloat(lifetime_budget) * 100);

    await axios.post(
      `https://graph.facebook.com/v19.0/${adset_id}`,
      { ...params, access_token: store.meta_access_token }
    );

    // Upiši u action_log
    await logAction(store_id, null, adset_id, 'budget_change',
      `Budžet promenjen: ${daily_budget ? 'Daily ' + daily_budget : 'Lifetime ' + lifetime_budget}. ${note || ''}`
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
};

// ─── POST /api/creatives/status ───────────────────────────────────────────────
// Pauziranje / aktiviranje kampanje, ad seta ili kreative
exports.setStatus = async (req, res) => {
  const { store_id, object_id, object_type, status, ad_id, note } = req.body;
  // object_type: 'campaign' | 'adset' | 'ad'
  if (!store_id || !object_id || !status) return res.status(400).json({ error: 'store_id, object_id i status su obavezni.' });

  const allowedStatuses = ['ACTIVE', 'PAUSED'];
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Status mora biti ACTIVE ili PAUSED.' });

  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [store_id]);
    if (!store?.meta_access_token) return res.status(400).json({ error: 'Nema Meta tokena.' });

    await axios.post(
      `https://graph.facebook.com/v19.0/${object_id}`,
      { status, access_token: store.meta_access_token }
    );

    await logAction(store_id, ad_id || null, object_id, status === 'PAUSED' ? 'pause' : 'activate',
      `${object_type} ${object_id} → ${status}. ${note || ''}`
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
};

// ─── POST /api/creatives/scale ────────────────────────────────────────────────
// Skaliranje budžeta (%)
exports.scaleBudget = async (req, res) => {
  const { store_id, adset_id, percent, note } = req.body;
  if (!store_id || !adset_id || !percent) return res.status(400).json({ error: 'store_id, adset_id i percent su obavezni.' });

  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [store_id]);
    if (!store?.meta_access_token) return res.status(400).json({ error: 'Nema Meta tokena.' });

    // Dohvati trenutni budžet
    const adsetData = await metaGet(
      `https://graph.facebook.com/v19.0/${adset_id}`,
      { fields: 'daily_budget,lifetime_budget' },
      store.meta_access_token
    );

    const multiplier = 1 + (parseFloat(percent) / 100);
    const params = {};
    if (adsetData.daily_budget) {
      params.daily_budget = Math.round(parseFloat(adsetData.daily_budget) * multiplier);
    } else if (adsetData.lifetime_budget) {
      params.lifetime_budget = Math.round(parseFloat(adsetData.lifetime_budget) * multiplier);
    } else {
      return res.status(400).json({ error: 'Ad Set nema definisan budžet.' });
    }

    await axios.post(
      `https://graph.facebook.com/v19.0/${adset_id}`,
      { ...params, access_token: store.meta_access_token }
    );

    const budgetType = adsetData.daily_budget ? 'daily' : 'lifetime';
    const oldVal = (adsetData.daily_budget || adsetData.lifetime_budget) / 100;
    const newVal = params[budgetType + '_budget'] / 100;

    await logAction(store_id, null, adset_id, 'scale',
      `Skaliranje ${percent}%: ${oldVal.toFixed(2)} → ${newVal.toFixed(2)}. ${note || ''}`
    );

    res.json({ success: true, new_budget: newVal, budget_type: budgetType });
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
};

// ─── GET /api/creatives/action-log ───────────────────────────────────────────
exports.getActionLog = async (req, res) => {
  const { store_id, limit = 100 } = req.query;
  try {
    let q = `SELECT al.*, s.name as store_name FROM action_log al
             LEFT JOIN stores s ON al.store_id = s.id`;
    const params = [];
    if (store_id && store_id !== 'all') {
      q += ' WHERE al.store_id = ?';
      params.push(store_id);
    }
    q += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [rows] = await db.query(q, params);
    res.json({ actions: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─── POST /api/creatives/action-log/:id/check ────────────────────────────────
// Čekiranje upozorenja — nestaje sa dashboarda, ide u istoriju
exports.checkAction = async (req, res) => {
  try {
    await db.query('UPDATE action_log SET checked = 1, checked_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ─── GET /api/creatives/adset/:id/budget ─────────────────────────────────────
exports.getAdsetBudget = async (req, res) => {
  const { store_id } = req.query;
  try {
    const [[store]] = await db.query('SELECT * FROM stores WHERE id = ?', [store_id]);
    if (!store?.meta_access_token) return res.status(400).json({ error: 'Nema Meta tokena.' });

    const data = await metaGet(
      `https://graph.facebook.com/v19.0/${req.params.id}`,
      { fields: 'id,name,daily_budget,lifetime_budget,budget_remaining,status' },
      store.meta_access_token
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
};

// ─── Helper: logAction ────────────────────────────────────────────────────────
async function logAction(store_id, ad_id, object_id, action, note) {
  try {
    await db.query(
      `INSERT INTO action_log (store_id, ad_id, object_id, action, note, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [store_id, ad_id || null, object_id, action, note || null]
    );
  } catch (e) {
    console.error('logAction greška:', e.message);
  }
}
