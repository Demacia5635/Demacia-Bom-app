import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import crypto from "crypto";
import { encrypt } from "../../src/util/encryption"; // Your encryption utility file

// Native password hashing using Node's built-in crypto (No external packages needed)
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