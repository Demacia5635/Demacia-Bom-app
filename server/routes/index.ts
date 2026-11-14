import express from 'express';
import * as healthController from '../controllers/healthController';
import dbRoutes from './dbRoutes';
import enumRoutes from './enumRoutes';
import driveRoutes from './driveRoutes';
import telemetryRoutes from './telemetryRoutes';

const router = express.Router();

router.get('/', healthController.checkAuth);

router.use('/db', dbRoutes);
router.use('/enum', enumRoutes);
router.use('/drive', driveRoutes);
router.use('/telemetry', telemetryRoutes);

export default router;
