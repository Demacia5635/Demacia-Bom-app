import express from "express";
import * as driveController from "../controllers/driveController";
import { drive } from "../services/driveClient";
import { checkAdmin } from "../auth";
import { getJob, listJobs, startOrganize } from "../services/driveOrganizer";

const router = express.Router();

router.get(
  "/",
  async (req, res) => await driveController.checkConnection(drive, req, res),
);

router.get(
  "/file/id/:fileID",
  async (req, res, next) =>
    await driveController.getFileFromId(drive, req, res, next),
);
router.post(
  "/file/name/:fileName/mime/:mimeType",
  driveController.checkUploadType,
  express.raw({ type: "*/*", limit: "20mb" }),
  async (req, res, next) =>
    await driveController.uploadFile(drive, req, res, next),
);
router.delete(
  "/file/id/:fileID",
  async (req, res, next) =>
    await driveController.deleteFile(drive, req, res, next),
);

// Admin: sort the parts' and assemblies' files into assembly folders
// (services/driveOrganizer.ts). Needs x-admin-secret as well.
router.post("/organize", checkAdmin, (req, res) => {
  const dryRun = req.body?.dryRun === true || req.query.dryRun === "true" || req.query.dryRun === "1";
  const job = startOrganize(dryRun);
  if (!job) return res.status(409).json({ message: "A sort is already running. Check GET /api/drive/organize." });
  return res.status(202).json({ jobId: job.id, dryRun: job.dryRun, status: job.status });
});
router.get("/organize", checkAdmin, (req, res) => res.status(200).json(listJobs()));
router.get("/organize/:jobId", checkAdmin, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ message: `No sort job ${req.params.jobId} (only the last 10 since the server started are kept)` });
  return res.status(200).json(job);
});

export default router;
