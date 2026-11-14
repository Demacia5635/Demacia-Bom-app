import express from 'express';
import * as partController from '../controllers/partController';
import * as onshapeController from '../controllers/onshapeController';

const router = express.Router();

// Local database part routes
router.get('/all', partController.getAllParts);
router.get('/id/:id', partController.getPartByID);
router.post('/id/:id', partController.upsertPartByID);
router.delete('/id/:id', partController.deletePartByID);

// Onshape-integrated routes (wired to onshapeController for Google Drive sync)
const onshapeKeyPath = '/d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/p/:partID';

// DB-only lookup: no Onshape API calls (they count against the yearly API limit).
router.get(onshapeKeyPath, partController.findPartByOnshapeKey);
router.post(onshapeKeyPath, onshapeController.updatePart);
router.delete(onshapeKeyPath, partController.deletePartByOnshapeKey);

// Thumbnail routes that trigger Google Drive upload & caching
router.get(`${onshapeKeyPath}/thumbnail`, onshapeController.getPartThumbnail);
router.post(`${onshapeKeyPath}/thumbnail`, onshapeController.setPartThumbnail);

export default router;