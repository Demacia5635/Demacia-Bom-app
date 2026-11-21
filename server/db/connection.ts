import mongoose from 'mongoose';
import { MONGODB_URI as mongoUri } from '../config';

export async function connect() {
    if (!mongoUri) throw new Error("MONGODB_URI is not set. Add it to server/.env (or the host's environment variables).");

    mongoose.connection.on('connected', () => console.log('MongoDB connected'));
    mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
    mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000
    });
    return isConnected();
}

export function isConnected() {
    return mongoose.connection.readyState === 1;
}
