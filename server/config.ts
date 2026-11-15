// The one place the server reads its environment. Importing this module loads
// server/.env first (dotenv), so every value below is ready whichever module
// is imported first.
import 'dotenv/config';

export const PORT = process.env.PORT || 5050;

export const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Shared secret the frontend sends as x-client-secret. Required: without it
 * the auth check compared the header against undefined, so requests with no
 * header at all passed and the whole API was open.
 */
export const CLIENT_SECRET: string = process.env.CLIENT_SECRET ?? "";
if (!CLIENT_SECRET) {
    throw new Error("CLIENT_SECRET is not set. Add it to server/.env (or the host's environment variables); the server won't start without it.");
}

const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:5050",
    "http://127.0.0.1:5173",
];

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

/** Browser origins allowed to call the API (CORS and checkAuth). */
export const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

export const google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    imageFolderId: process.env.GOOGLE_DRIVE_IMAGE_FOLDER_ID as string,
    stlFolderId: process.env.GOOGLE_DRIVE_STL_FOLDER_ID as string,
    parasolidFolderId: process.env.GOOGLE_DRIVE_PARASOLID_FOLDER_ID as string,
};
