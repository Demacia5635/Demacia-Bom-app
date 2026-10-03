import { Request } from "express";
import User from "../../../server/models/User";
import crypto from "crypto";

const getEncryptionKey = (): Buffer => {
    const rawKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!rawKey) {
        throw new Error("MASTER_ENCRYPTION_KEY is missing from environment variables.");
    }
    return crypto.createHash("sha256").update(rawKey).digest();
};

function decrypt(encryptedText: string): string {
    if (!encryptedText) return "";
    const [ivHex, encryptedHex] = encryptedText.split(":");
    if (!ivHex || !encryptedHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

export interface UserKeys {
    accessKey: string;
    secretKey: string;
}

export async function getOnshapeKeysFromRequest(req: Request): Promise<UserKeys> {
    const username = (req.headers["x-username"] || req.headers["X-Username"]) as string;

    // 1. Try to find user in MongoDB if username is provided
    if (username) {
        const user = await User.findOne({ username });
        if (user && user.onshapeAccessKey && user.onshapeSecretKey) {
            try {
                const decryptedSecret = decrypt(user.onshapeSecretKey);
                if (decryptedSecret) {
                    return {
                        accessKey: user.onshapeAccessKey,
                        secretKey: decryptedSecret,
                    };
                }
            } catch (err) {
                console.error("Failed to decrypt user-specific secret key, falling back to environment keys.");
            }
        }
    }

    // 2. Fallback to Deployment Environment Variables (from deploy.yaml or .env)
    const fallbackAccessKey = process.env.VITE_ONSHAPE_ACCESS_KEY || process.env.ONSHAPE_ACCESS_KEY;
    const fallbackSecretKey = process.env.VITE_ONSHAPE_SECRET_KEY || process.env.ONSHAPE_SECRET_KEY;

    if (fallbackAccessKey && fallbackSecretKey) {
        return {
            accessKey: fallbackAccessKey,
            secretKey: fallbackSecretKey,
        };
    }

    throw new Error("Invalid or missing client secrets: No user-specific keys found in DB and no deployment environment keys available.");
}