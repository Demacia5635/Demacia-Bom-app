import express from 'express';
import * as workOrderController from '../controllers/workOrderController';

const router = express.Router();

router.get('/all', workOrderController.getAllWorkOrders);

router.get('/id/:id', workOrderController.getWorkOrderByID);
router.post('/id/:id', workOrderController.upsertWorkOrderByID);
// One part's fields: { partID, changes } (partID in the body: part IDs can contain "/").
router.post('/id/:id/part', workOrderController.updateWorkOrderPart);
router.delete('/id/:id', workOrderController.deleteWorkOrderByID);

export default router;
