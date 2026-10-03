import express from 'express';
import * as healthController from '../controllers/healthController';
import dbRoutes from './dbRoutes';
import enumRoutes from './enumRoutes';
import onshapeRoutes from './onshapeRoutes';
import driveRoutes from './driveRoutes';
import authRoutes from './authRoutes'; // <--- 1. Import your auth routes

const router = express.Router();

router.get('/', healthController.checkAuth);

router.use('/auth', authRoutes); // <--- 2. Mount auth routes at /auth
router.use('/db', dbRoutes);
router.use('/enum', enumRoutes);
router.use('/onshape', onshapeRoutes);
router.use('/drive', driveRoutes);

export default router;