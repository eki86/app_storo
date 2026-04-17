const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

router.get('/kpi', auth, ctrl.getKPI);
router.get('/chart', auth, ctrl.getChart);

module.exports = router;
