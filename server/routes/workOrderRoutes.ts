import express from 'express';
import * as workOrderController from '../controllers/workOrderController';
import { getWorkOrderSummary } from '../controllers/workOrderSummary';

const router = express.Router();

router.get('/all', workOrderController.getAllWorkOrders);
// Every work order with its progress, from its live BOM (the list's progress bars).
router.get('/summary', getWorkOrderSummary);

router.get('/id/:id', workOrderController.getWorkOrderByID);
router.post('/id/:id', workOrderController.upsertWorkOrderByID);
// One part's fields: { partID, changes } (partID in the body: part IDs can contain "/").
router.post('/id/:id/part', workOrderController.updateWorkOrderPart);
router.post('/id/:id/cncGroup', workOrderController.updateCncGroup);
router.delete('/id/:id', workOrderController.deleteWorkOrderByID);

export default router;
