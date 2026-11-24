import express from 'express';
import dbRoutes from './dbRoutes';
import enumRoutes from './enumRoutes';
import driveRoutes from './driveRoutes';
import telemetryRoutes from './telemetryRoutes';
import { SERVER_VERSION, STARTED_AT } from '../config';
import { isConnected } from '../db/connection';
import adminRoutes from './adminRoutes';

const router = express.Router();

// Public API health check (auth already ran in app.ts and lets "/" through).
// Shows which version runs, since when, and whether MongoDB is reachable,
// e.g. after a Render redeploy. Always 200 while the process is up.
router.get('/', (req, res) => {
    res.status(200).json({
        status: 'online',
        version: SERVER_VERSION,
        startedAt: STARTED_AT,
        database: isConnected() ? 'connected' : 'disconnected',
    });
});

// The website's admin pages (x-admin-secret on every route).
router.use('/admin', adminRoutes);

router.use('/db', dbRoutes);
router.use('/enum', enumRoutes);
router.use('/drive', driveRoutes);
router.use('/telemetry', telemetryRoutes);

export default router;
