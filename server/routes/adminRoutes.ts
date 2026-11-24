// Admin routes for the website's admin pages: every one needs x-admin-secret
// (checkAdmin: 404 when it's wrong, 429 when locked) on top of the client secret.
import express from 'express';
import { adminCheck, checkAdmin } from '../auth';
import { getServerStatus } from '../controllers/adminController';

const router = express.Router();
router.use(checkAdmin);

// The website's admin unlock: 204 when x-admin-secret is right.
router.get('/check', adminCheck);
// #/server: version, uptime, DB and Drive, recent sort runs, lockouts, response times.
router.get('/status', getServerStatus);

export default router;
