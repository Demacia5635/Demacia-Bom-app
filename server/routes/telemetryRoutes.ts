import express from 'express';
import * as telemetryController from '../controllers/telemetryController';

const router = express.Router();

// Onshape footprint of the Chrome extension (shown on the website's /tele page).
router.get('/events', telemetryController.listEvents);
router.post('/events', telemetryController.addEvents);

export default router;
