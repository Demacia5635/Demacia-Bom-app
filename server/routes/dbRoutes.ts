import express from 'express';
import * as healthController from '../controllers/healthController';
import partRoutes from './partRoutes';
import bomRoutes from './bomRoutes';
import workOrderRoutes from './workOrderRoutes';
import { getDataHealth } from '../controllers/dataHealth';

const router = express.Router();

router.get('/', healthController.checkDBConnection);
// Every problem in the parts and BOMs (the website's data health page). Read-only.
router.get('/health', getDataHealth);

router.use('/part', partRoutes);
router.use('/bom', bomRoutes);
router.use('/workOrder', workOrderRoutes);

export default router;
