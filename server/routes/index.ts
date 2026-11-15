import express from 'express';
import dbRoutes from './dbRoutes';
import enumRoutes from './enumRoutes';
import driveRoutes from './driveRoutes';
import telemetryRoutes from './telemetryRoutes';

const router = express.Router();

// Public API health check (auth already ran in app.ts and lets "/" through).
router.get('/', (req, res) => {
    res.status(200).json({ status: 'online' });
});

router.use('/db', dbRoutes);
router.use('/enum', enumRoutes);
router.use('/drive', driveRoutes);
router.use('/telemetry', telemetryRoutes);

export default router;
