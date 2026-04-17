const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const ctrl    = require('../controllers/creativesController');

router.get('/',                        auth, ctrl.getCreatives);
router.get('/action-log',              auth, ctrl.getActionLog);
router.get('/adset/:id/budget',        auth, ctrl.getAdsetBudget);
router.post('/budget',                 auth, ctrl.setBudget);
router.post('/status',                 auth, ctrl.setStatus);
router.post('/scale',                  auth, ctrl.scaleBudget);
router.post('/action-log/:id/check',   auth, ctrl.checkAction);

module.exports = router;
