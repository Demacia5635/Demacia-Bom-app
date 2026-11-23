import express from 'express';
import * as partController from '../controllers/partController';
import { deleteOrphanParts, getOrphanParts } from '../controllers/orphanParts';
import { checkAdmin } from '../auth';

const router = express.Router();

// Parts by database ID
router.get('/all', partController.getAllParts);
// Read-only batch lookup: { ids: [...] } -> the parts that exist.
router.post('/ids', partController.getPartsByIds);
// Parts no assembly uses (the website's /orphans page). Read-only.
router.get('/orphans', getOrphanParts);
// Admin (x-admin-secret): deletes parts no BOM uses, re-checked one by one.
router.post('/orphans/delete', checkAdmin, deleteOrphanParts);
router.get('/id/:id', partController.getPartByID);
router.post('/id/:id', partController.upsertPartByID);
router.delete('/id/:id', partController.deletePartByID);

// Parts by Onshape identity (database only; the server never calls Onshape)
const onshapeKeyPath = '/d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/p/:partID';

router.get(onshapeKeyPath, partController.findPartByOnshapeKey);
router.delete(onshapeKeyPath, partController.deletePartByOnshapeKey);

export default router;
