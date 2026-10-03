import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import crypto from "crypto";

// --- Strict 32-byte Encryption Key Handler ---
const getEncryptionKey = (): Buffer => {
    const rawKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!rawKey) {
        throw new Error("MASTER_ENCRYPTION_KEY is missing from environment variables.");
    }
    return crypto.createHash("sha256").update(rawKey).digest();
};

function encrypt(text: string): string {
    if (!text) return "";
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
}

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

// Native password hashing using Node's built-in crypto
function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, key] = storedHash.split(":");
    const hashedBuffer = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, "hex");
    return crypto.timingSafeEqual(hashedBuffer, keyBuffer);
}

export async function signup(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password, onshapeAccessKey, onshapeSecretKey } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists." });
        }

        const securePassword = hashPassword(password);
        const encryptedSecretKey = onshapeSecretKey ? encrypt(onshapeSecretKey) : "";

        // Completely open public registration — no header or key lookup required
        const newUser = await User.create({
            username,
            password: securePassword,
            onshapeAccessKey: onshapeAccessKey || "",
            onshapeSecretKey: encryptedSecretKey,
        });

        return res.status(201).json({ message: "Account created successfully", userId: newUser._id });
    } catch (err) {
        return next(err);
    }
}

export async function signin(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        const isMatch = verifyPassword(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        return res.status(200).json({ message: "Signed in successfully", username: user.username });
    } catch (err) {
        return next(err);
    }
}

export async function debugKeys(req: Request, res: Response, next: NextFunction) {
    try {
        const username = req.query.username as string;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            onshapeAccessKey: user.onshapeAccessKey,
            onshapeSecretKey: user.onshapeSecretKey ? decrypt(user.onshapeSecretKey) : "",
        });
    } catch (err) {
        return next(err);
    }
}