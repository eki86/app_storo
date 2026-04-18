const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/finansijeController');

router.get('/summary', auth, ctrl.getSummary);
router.get('/products', auth, ctrl.getProductsFinancials);
router.post('/product-cost', auth, ctrl.saveProductCost);
router.get('/product-cost-history', auth, ctrl.getProductCostHistory);
router.delete('/product-cost-history/:id', auth, ctrl.deleteProductCostHistory);
router.get('/product-sales-history', auth, ctrl.getProductSalesHistory);

module.exports = router;
