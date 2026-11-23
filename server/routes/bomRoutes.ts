import express, { Request, Response } from 'express';
import * as bomController from '../controllers/bomController';

const router = express.Router();

/**
 * Deleting BOMs is turned off (the user's decision, 2026-11-21): no BOM may
 * be deleted yet. To turn it back on, route DELETE to
 * bomController.deleteBomByID / deleteBomByOnshapeKey again (both still exist).
 */
function bomDeleteTurnedOff(req: Request, res: Response) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Deleting BOMs is turned off' });
}

router.get('/all', bomController.getAllBoms);
// Read-only batch lookup: { ids: [...] } -> the assemblies that exist.
router.post('/ids', bomController.getBomsByIds);

// The BOM with all its sub-assemblies and parts, in one request.
router.get('/tree/:id', bomController.getBomTree);
// The BOMs that use this one as a sub-assembly.
router.get('/usedIn/:id', bomController.getBomUsedIn);
// Is this Onshape assembly already saved from another workspace/version? (read-only)
router.get('/publishedElsewhere', bomController.getBomPublishedElsewhere);

router.get('/id/:id', bomController.getBomByID);
router.post('/id/:id', bomController.upsertBomByID);
router.delete('/id/:id', bomDeleteTurnedOff);

const onshapeKeyPath = '/d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/b/:bomID';
router.get(onshapeKeyPath, bomController.getBomByOnshapeKey);
router.post(onshapeKeyPath, bomController.upsertBomByOnshapeKey);
router.delete(onshapeKeyPath, bomDeleteTurnedOff);

export default router;
