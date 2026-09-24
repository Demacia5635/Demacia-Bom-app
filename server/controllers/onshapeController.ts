import { Request, Response } from "express";
import onshapeService, {
  OnshapeApiError,
  UnsupportedOnshapeOperationError,
} from "../services/onshapeService";

interface OnshapePartParams {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
  partID: string;
}

interface OnshapeBomParams {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
}

function handleOnshapeError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
): Response {
  if (err instanceof UnsupportedOnshapeOperationError) {
    return res.status(501).json({ message: err.message });
  }
  if (err instanceof OnshapeApiError) {
    return res
      .status(err.status)
      .json({ message: err.message, onshapeResponse: err.body });
  }
  const message = err instanceof Error ? err.message : String(err);
  return res.status(502).json({ message: fallbackMessage, error: message });
}

function ensureBuffer(data: any): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") {
    if (data.startsWith("data:image")) {
      return Buffer.from(data.split(",")[1], "base64");
    }
    return Buffer.from(data, "base64");
  }
  if (data instanceof ArrayBuffer || data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "object" && "data" in data && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  try {
    return Buffer.from(data);
  } catch (err) {
    return null;
  }
}

export async function checkConnection(req: Request, res: Response) {
  const connected = await onshapeService.checkConnection();
  return res.status(connected ? 200 : 503).json({ connected });
}

export async function getPart(req: Request<OnshapePartParams>, res: Response) {
  try {
    const part = await onshapeService.getPartForDb(req.params);
    return res.status(200).json(part);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to fetch part from Onshape");
  }
}

export async function updatePart(
  req: Request<OnshapePartParams, unknown, Record<string, unknown>>,
  res: Response,
) {
  try {
    const part = await onshapeService.updatePart(req.params, req.body);
    return res.status(200).json(part);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update part in Onshape");
  }
}

export async function getBom(req: Request<OnshapeBomParams>, res: Response) {
  try {
    const bom = await onshapeService.getBom(req.params);
    return res.status(200).json(bom["bomTable"]);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to fetch bom from Onshape");
  }
}

export async function updateBom(
  req: Request<
    OnshapeBomParams, 
    unknown, 
    { 
      properties: Array<{ propertyId: string; value: unknown }> 
    } | Record<string, unknown>>,
  res: Response
) {
  try {
    const assembly = await onshapeService.updateAssembly(req.params, req.body)
    return res.status(200).json(assembly);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to update assembly in Onshape");
  }
}

export async function getPartThumbnail(
  req: Request<OnshapePartParams & { size?: string }>,
  res: Response,
) {
  try {
    // 1. Check if the database record already contains a cached Base64 avatarID string
    const existingPart = await onshapeService.getPartForDb(req.params).catch(() => null);
    if (existingPart && typeof (existingPart as any).avatarID === 'string' && (existingPart as any).avatarID.startsWith("data:image")) {
      console.log(`[CACHE HIT] Part thumbnail served from DB.`);
      const b64Data = (existingPart as any).avatarID.split(",")[1];
      const buffer = Buffer.from(b64Data, 'base64');
      res.setHeader("Content-Type", "image/png");
      return res.status(200).send(buffer);
    }

    console.log(`[CACHE MISS] Fetching Part thumbnail from Onshape...`);

    // 2. Fetch from Onshape if not cached
    const thumbnail = await onshapeService.getPartThumbnail(req.params, req.params.size);
    if (!thumbnail) return res.status(404).json({ message: "part thumbnail not found" });

    // 3. Convert to Base64 and save to MongoDB via service update
    const safeBuffer = ensureBuffer(thumbnail);
    if (safeBuffer) {
      const base64String = `data:image/png;base64,${safeBuffer.toString("base64")}`;
      await onshapeService.updatePart(req.params, { avatarID: base64String })
        .catch(e => console.error("Failed to cache part avatarID to DB:", e));
    }
    
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(safeBuffer || thumbnail);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to fetch thumbnail for part");
  }
}

export async function setPartThumbnail(
  req: Request<OnshapePartParams, unknown, Buffer>,
  res: Response,
) {
  try {
    const buffer = req.body;
    const safeBuffer = ensureBuffer(buffer);
    if (!safeBuffer) return res.status(400).json({ message: `Invalid buffer provided` });

    await onshapeService.setPartThumbnail(req.params, safeBuffer);
    return res.sendStatus(204);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to set thumbnail for part");
  }
}

export async function getElementThumbnail(
  req: Request<OnshapeBomParams & { size?: string }>,
  res: Response,
) {
  try {
    // 1. Check if the database record already contains a cached Base64 avatarID string
    const existingBom = await onshapeService.getBom(req.params).catch(() => null);
    if (existingBom && typeof (existingBom as any).avatarID === 'string' && (existingBom as any).avatarID.startsWith("data:image")) {
      console.log(`[CACHE HIT] BOM element thumbnail served from DB.`);
      const b64Data = (existingBom as any).avatarID.split(",")[1];
      const buffer = Buffer.from(b64Data, 'base64');
      res.setHeader("Content-Type", "image/png");
      return res.status(200).send(buffer);
    }

    console.log(`[CACHE MISS] Fetching BOM element thumbnail from Onshape...`);

    // 2. Fetch from Onshape if not cached
    const thumbnail = await onshapeService.getElementThumbnail(req.params, req.params.size);
    if (!thumbnail) return res.status(404).json({ message: "element thumbnail not found" });

    // 3. Convert to Base64 and save to MongoDB via service update
    const safeBuffer = ensureBuffer(thumbnail);
    if (safeBuffer) {
      const base64String = `data:image/png;base64,${safeBuffer.toString("base64")}`;
      await onshapeService.updateAssembly(req.params, { avatarID: base64String })
        .catch(e => console.error("Failed to cache element avatarID to DB:", e));
    }

    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(safeBuffer || thumbnail);
  } catch (err) {
    return handleOnshapeError(
      res,
      err,
      "Failed to fetch thumbnail for element",
    );
  }
}

export async function setElementThumbnail(
  req: Request<OnshapeBomParams, unknown, Buffer>,
  res: Response,
) {
  try {
    const buffer = req.body;
    const safeBuffer = ensureBuffer(buffer);
    if (!safeBuffer) return res.status(400).json({ message: `Invalid buffer provided` });

    await onshapeService.setElementThumbnail(req.params, safeBuffer);
    return res.sendStatus(204);
  } catch (err) {
    return handleOnshapeError(res, err, "Failed to set thumbnail for element");
  }
}

export async function exportSTL(
  req: Request<OnshapePartParams>,
  res: Response
) {
  try {
    const stl = await onshapeService.exportPartToStl(req.params);
    if (!stl) return res.status(404).json({ message: `part not found ${JSON.stringify(req.params)}`});

    res.setHeader("Content-Type", "model/stl");
    return res.status(200).send(stl);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export stl');
  }
}

export async function exportParasolid(
  req: Request<OnshapePartParams>,
  res: Response
) {
  try {
    const parasolid = await onshapeService.exportPartToParasolid(req.params);
    if (!parasolid) return res.status(404).json({ message: `part not found ${JSON.stringify(req.params)}`});

    res.setHeader("Content-Type", "application/x-parasolid");
    return res.status(200).send(parasolid);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export parasolid');
  }
}

export async function exportSolidworks(
  req: Request<OnshapePartParams>,
  res: Response
) {
  try {
    const solidworks = await onshapeService.exportPartToSolidworks(req.params);
    if (!solidworks) return res.status(404).json({ message: `part not found ${JSON.stringify(req.params)}`});

    res.setHeader("Content-Type", "application/sldprt");
    return res.status(200).send(solidworks);
  } catch (err) {
    return handleOnshapeError(res, err, 'Failed to export solidworks');
  }
}