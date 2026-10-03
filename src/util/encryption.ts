/// <reference types="node" />
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.MASTER_ENCRYPTION_KEY;
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
    if (!ENCRYPTION_KEY) {
        throw new Error("MASTER_ENCRYPTION_KEY is not configured");
    }
    return Buffer.from(ENCRYPTION_KEY);
}

export function encrypt(text: string): string {
    if (!text) return "";
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string): string {
    if (!text) return "";
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift()!, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}