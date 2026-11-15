import dns from 'node:dns';
import { PORT } from './config';
import app from './app';
import { connect } from './db/connection';

dns.setDefaultResultOrder("ipv4first");

async function startServer(): Promise<void> {
  try {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
    await connect();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
