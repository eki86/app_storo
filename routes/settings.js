const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/settingsController');

router.get('/stores', auth, ctrl.getStores);
router.post('/stores', auth, ctrl.saveStore);
router.delete('/stores/:id', auth, ctrl.deleteStore);
router.post('/stores/:id/test-shopify', auth, ctrl.testShopify);
router.post('/stores/:id/refresh-token', auth, ctrl.refreshToken);

module.exports = router;