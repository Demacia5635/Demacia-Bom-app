import express from 'express';
import * as telemetryController from '../controllers/telemetryController';

const router = express.Router();

// Onshape footprint of the Chrome extension (shown on the website's /tele page).
router.get('/events', telemetryController.listEvents);
router.post('/events', telemetryController.addEvents);
// Per day, per kind and per user, aggregated in MongoDB (the /tele charts).
router.get('/stats', telemetryController.getStats);

export default router;
