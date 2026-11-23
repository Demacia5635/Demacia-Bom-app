// The server's one Google Drive client, shared by the Drive routes and the
// folder sorting (services/driveOrganizer.ts).
import { google } from "googleapis";
import { google as googleConfig } from "../config";
import { createGoogleDriveService } from "./driveService";

const auth = new google.auth.OAuth2(
  googleConfig.clientId,
  googleConfig.clientSecret,
  googleConfig.redirectUri,
);
auth.setCredentials({
  refresh_token: googleConfig.refreshToken,
});

export const drive = createGoogleDriveService(auth);
