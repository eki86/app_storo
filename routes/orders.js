const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/ordersController');

router.get('/', auth, ctrl.getOrders);
router.get('/stats', auth, ctrl.getStats);

module.exports = router;
