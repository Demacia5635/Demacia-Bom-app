import dns from 'node:dns';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { ADMIN_SECRET, PORT, SERVER_VERSION, allowedOrigins, google } from './config';
import app from './app';
import { connect } from './db/connection';
import { TELEMETRY_TTL_SECONDS } from './models/TelemetryEvent';

/** One line with the settings in use, for Render's logs. Never secrets. */
function settingsSummary(): string {
  const set = (value: string | undefined) => (value ? "set" : "MISSING");
  return [
    `[settings] v${SERVER_VERSION}`,
    `port ${PORT}`,
    `NODE_ENV ${process.env.NODE_ENV || "(not set)"}`,
    `origins ${allowedOrigins.join(", ") || "(none)"}`,
    `Drive folders: image ${set(google.imageFolderId)}, STL ${set(google.stlFolderId)}, Parasolid ${set(google.parasolidFolderId)}`,
    `telemetry kept ${Math.round(TELEMETRY_TTL_SECONDS / 86_400)} days`,
    `admin routes ${ADMIN_SECRET ? "on" : "off (ADMIN_SECRET not set)"}`,
  ].join(" | ");
}

dns.setDefaultResultOrder("ipv4first");

/** Longest wait for running requests on shutdown (Render allows 30 s). */
const SHUTDOWN_TIMEOUT_MS = 20_000;

let server: Server | undefined;
let shuttingDown = false;

/**
 * On SIGTERM (a Render redeploy) or SIGINT (Ctrl+C): stop taking requests,
 * let the running ones finish, then close the database connection.
 */
function shutDown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: finishing running requests, then shutting down`);

  const force = setTimeout(() => {
    console.error(`Requests still running after ${SHUTDOWN_TIMEOUT_MS / 1000} s; shutting down anyway`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  const closeDatabase = () => {
    mongoose.disconnect()
      .catch((err) => console.error("Closing the database connection failed:", err))
      .finally(() => process.exit(0));
  };

  if (!server) return closeDatabase();
  server.close(closeDatabase);
  // Idle keep-alive connections would otherwise hold close() open.
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutDown("SIGTERM"));
process.on("SIGINT", () => shutDown("SIGINT"));

async function startServer(): Promise<void> {
  try {
    server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(settingsSummary());
    });
    await connect();
  } catch (error) {
    // Shut down while still connecting: that's not a failed start.
    if (shuttingDown) return;
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
