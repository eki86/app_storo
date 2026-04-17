const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/finansijeController');

router.get('/summary', auth, ctrl.getSummary);
router.get('/products', auth, ctrl.getProductsFinancials);
router.post('/product-cost', auth, ctrl.saveProductCost);

module.exports = router;
