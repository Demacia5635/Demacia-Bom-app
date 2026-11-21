import express from 'express';
import * as enumController from '../controllers/enumController';

const router = express.Router();

router.get('/productionType/all', enumController.getAllProductionTypes);
router.get('/productionType/id/:id', enumController.getProductionTypeByID);

export default router;
