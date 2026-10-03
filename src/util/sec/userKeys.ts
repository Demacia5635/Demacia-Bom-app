import { Request } from "express";
import User from "../../../server/models/User";
import { decrypt } from "./encryption";

export interface UserKeys {
    accessKey: string;
    secretKey: string;
}

// Extend Express Request type so TypeScript knows about req.userKeys
declare global {
    namespace Express {
        interface Request {
            userKeys?: UserKeys;
        }
    }
}

/**
 * Middleware or helper to attach userKeys to req
 */
export async function attachOnshapeKeys(req: Request): Promise<UserKeys> {
    if (req.userKeys) return req.userKeys; // Cache for the request lifecycle

    const username = req.headers["x-username"] as string;
    if (!username) {
        throw new Error("Missing x-username header. Please ensure you are signed in.");
    }

    const user = await User.findOne({ username });
    if (!user || !user.onshapeAccessKey || !user.onshapeSecretKey) {
        throw new Error(`Onshape API keys not configured for user '${username}'.`);
    }

    req.userKeys = {
        accessKey: user.onshapeAccessKey,
        secretKey: decrypt(user.onshapeSecretKey),
    };

    return req.userKeys;
}