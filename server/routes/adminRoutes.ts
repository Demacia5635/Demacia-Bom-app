// Admin routes for the website's admin pages: every one needs x-admin-secret
// (checkAdmin: 404 when it's wrong, 429 when locked) on top of the client secret.
import express from 'express';
import { adminCheck, checkAdmin } from '../auth';
import { getEvents, getRevisions, getServerStatus } from '../controllers/adminController';
import { getProduction, getStale } from '../controllers/workOrderSummary';
import { deleteUnusedFiles, getFilesOverview } from '../controllers/driveFiles';
import { repairFinished } from '../controllers/workOrderRepair';

const router = express.Router();
router.use(checkAdmin);

// The website's admin unlock: 204 when x-admin-secret is right.
router.get('/check', adminCheck);
// #/server: version, uptime, DB and Drive, recent sort runs, lockouts, response times.
router.get('/status', getServerStatus);
// #/production: work orders' progress, open orders, what blocks them.
router.get('/production', getProduction);
// #/files: the team's Drive files (sizes, largest, unused, missing), and deleting unused ones.
router.get('/files', getFilesOverview);
router.post('/files/delete', deleteUnusedFiles);
// #/activity: what happened (the events collection), newest first.
router.get('/events', getEvents);
// #/revisions: revision bumps with the open work orders that contain each part.
router.get('/revisions', getRevisions);
// #/stale: work orders whose parts changed since they were created.
router.get('/stale', getStale);
// One-off repair: lines with Priority "Finished" but a status that isn't (dry run first).
router.post('/workorders/repair-finished', repairFinished);

export default router;
