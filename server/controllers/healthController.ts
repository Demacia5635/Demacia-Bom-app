import { Request, Response } from "express";
import { isConnected } from "../db/connection";

export function checkDBConnection(req: Request, res: Response) {
  const connected = isConnected();
  return res.status(connected ? 200 : 503).json({ connected });
}