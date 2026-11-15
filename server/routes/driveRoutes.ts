import express from "express";
import * as driveController from "../controllers/driveController";
import { createGoogleDriveService } from "../services/driveService";
import { google } from "googleapis";
import { google as googleConfig } from "../config";

const router = express.Router();
const auth = new google.auth.OAuth2(
  googleConfig.clientId,
  googleConfig.clientSecret,
  googleConfig.redirectUri,
);
auth.setCredentials({
  refresh_token: googleConfig.refreshToken,
});

const drive = createGoogleDriveService(auth);

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
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req, res, next) =>
    await driveController.uploadFile(drive, req, res, next),
);
router.delete(
  "/file/id/:fileID",
  async (req, res, next) =>
    await driveController.deleteFile(drive, req, res, next),
);

router.get(
  "/folder/id/:folderID",
  async (req, res, next) =>
    await driveController.getFilesFromFolder(drive, req, res, next),
);

export default router;
