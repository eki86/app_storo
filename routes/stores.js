const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

router.get('/', auth, async (req, res) => {
  try {
    const [stores] = await db.query('SELECT id, name FROM stores ORDER BY name');
    res.json({ stores });
  } catch (err) {
    res.status(500).json({ error: 'Greška' });
  }
});

module.exports = router;
