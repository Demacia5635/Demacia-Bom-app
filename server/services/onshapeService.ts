import "dotenv/config";

const ONSHAPE_BASE_URL =
  process.env.ONSHAPE_BASE_URL || "https://cad.onshape.com/api";

export interface OnshapePartRef {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
  partID: string;
}

export interface OnshapeBomRef {
  documentID: string;
  wvmType: string;
  wvmID: string;
  elementID: string;
}

export interface UserKeys {
  accessKey: string;
  secretKey: string;
}

export type OnshapeValueType =
  | "STRING"
  | "BOOL"
  | "INT"
  | "DOUBLE"
  | "DATE"
  | "ENUM"
  | "OBJECT"
  | "BLOB"
  | "USER";

export type OnshapeMetadataObjectType =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type OnshapePublishState = 0 | 1 | 2;

export interface OnshapeEnumValue {
  value: string;
  label?: string;
  [key: string]: unknown;
}

export interface OnshapePropertyValidator {
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  pattern?: string | null;
}

export interface OnshapePropertyUiHints {
  multiline?: boolean;
  [key: string]: unknown;
}

export interface OnshapeMetadataProperty {
  propertyId: string;
  name?: string;
  description?: string;
  schemaId?: string;
  namespace?: string;
  value: unknown;
  defaultValue?: unknown;
  valueType?: OnshapeValueType;
  enumValues?: OnshapeEnumValue[] | null;
  validator?: OnshapePropertyValidator;
  uiHints?: OnshapePropertyUiHints;
  required?: boolean;
  editable?: boolean;
  editableInUi?: boolean;
  multivalued?: boolean;
  dateFormat?: string | null;
  propertySource?: number;
  computedProperty?: boolean;
  computedAssemblyProperty?: boolean;
  computedPropertyError?: string | null;
  propertyOverrideStatus?: number;
  [key: string]: unknown;
}

export interface OnshapePartMetadata {
  jsonType?: string;
  partId?: string;
  elementId?: string;
  properties: OnshapeMetadataProperty[];
  [key: string]: unknown;
}

export interface OnshapeBomTableItem {
  id?: string;
  itemSource?: {
    documentId?: string;
    elementId?: string;
    partId?: string;
    [key: string]: unknown;
  };
  headerIdToValue?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OnshapeBomSource {
  documentId?: string;
  elementId?: string;
  version?: {
    versionId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OnshapeBomTable {
  bomSource?: OnshapeBomSource;
  items?: OnshapeBomTableItem[];
  [key: string]: unknown;
}

export interface OnshapeBillOfMaterials {
  bomTable?: OnshapeBomTable;
  [key: string]: unknown;
}

export interface OnshapeElementMetadata {
  jsonType?: string;
  elementId?: string;
  elementType?: number;
  mimeType?: string;
  properties: OnshapeMetadataProperty[];
  [key: string]: unknown;
}

export class UnsupportedOnshapeOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOnshapeOperationError";
  }
}

export class OnshapeApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "OnshapeApiError";
    this.status = status;
    this.body = body;
  }
}

function authHeader(userKeys: UserKeys): string {
  if (!userKeys.accessKey || !userKeys.secretKey) {
    throw new Error("Missing accessKey or secretKey for Onshape authentication.");
  }
  const token = Buffer.from(`${userKeys.accessKey}:${userKeys.secretKey}`).toString("base64");
  return `Basic ${token}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${ONSHAPE_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function onshapeRequest<T>(
  path: string,
  userKeys: UserKeys,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query } = options;
  const url = buildUrl(path, query);

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json;charset=UTF-8; qs=0.09",
      "Content-Type": "application/json;charset=UTF-8; qs=0.09",
      Authorization: authHeader(userKeys),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new OnshapeApiError(
      `Onshape API request failed: ${method} ${path} -> ${response.status}`,
      response.status,
      parsed,
    );
  }

  return parsed as T;
}

async function checkConnection(userKeys: UserKeys): Promise<boolean> {
  try {
    await onshapeRequest("/users/sessioninfo", userKeys);
    return true;
  } catch {
    return false;
  }
}

export const PART_PROPERTY_ID_MAP: Record<string, string> = {
  name: "57f3fb8efa3416c06701d60d",
  catalogNumber: "57f3fb8efa3416c06701d60f",
  revision: "57f3fb8efa3416c06701d610",
  description: "57f3fb8efa3416c06701d60e",
  engineer: "57f3fb8efa3416c06701d619",
  material: "57f3fb8efa3416c06701d615",
  price: "6617a03ef812b159a51a8786",
  comments: "66154a7f56997c7041994212",
  vendor: "57f3fb8efa3416c06701d612",
};

function readPropertyValue(fieldName: string, rawValue: unknown): unknown {
  if (fieldName === "material") {
    if (rawValue && typeof rawValue === "object") {
      return (
        (rawValue as { displayName?: string; id?: string }).displayName ?? ""
      );
    }
    return typeof rawValue === "string" ? rawValue : "";
  }
  return rawValue ?? "";
}

function mapPartMetadataToModel(
  metadata: OnshapePartMetadata,
): Record<string, unknown> {
  const byPropertyId = new Map(
    metadata.properties.map((p) => [p.propertyId, p]),
  );
  const result: Record<string, unknown> = {};

  for (const [fieldName, propertyId] of Object.entries(PART_PROPERTY_ID_MAP)) {
    const property = byPropertyId.get(propertyId);
    result[fieldName] = readPropertyValue(fieldName, property?.value);
  }

  return result;
}

async function getPart(ref: OnshapePartRef, userKeys: UserKeys): Promise<OnshapePartMetadata> {
  const { documentID, wvmType, wvmID, elementID, partID } = ref;
  return onshapeRequest<OnshapePartMetadata>(
    `/metadata/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/p/${partID}`,
    userKeys,
  );
}

async function getPartForDb(
  ref: OnshapePartRef,
  userKeys: UserKeys,
): Promise<Record<string, unknown>> {
  const metadata = await getPart(ref, userKeys);
  return mapPartMetadataToModel(metadata);
}

async function updatePart(
  ref: OnshapePartRef,
  data:
    | { properties: Array<{ propertyId: string; value: unknown }> }
    | Record<string, unknown>,
  userKeys: UserKeys,
): Promise<OnshapePartMetadata> {
  const { documentID, wvmType, wvmID, elementID, partID } = ref;
  const path = `/metadata/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/p/${partID}`;

  let properties: Array<{ propertyId: string; value: unknown }>;

  if (
    "properties" in data &&
    Array.isArray((data as { properties: unknown }).properties)
  ) {
    properties = (
      data as { properties: Array<{ propertyId: string; value: unknown }> }
    ).properties;
  } else {
    properties = Object.entries(data as Record<string, unknown>)
      .map(([fieldName, value]) => {
        const propertyId = PART_PROPERTY_ID_MAP[fieldName];
        if (!propertyId) return null;
        if (fieldName === 'material') return null;
        return { propertyId, value };
      })
      .filter((p): p is { propertyId: string; value: unknown } => p !== null);

    if (properties.length === 0) {
      throw new Error(
        `None of the provided fields have a known Onshape propertyId mapping: ${Object.keys(
          data as Record<string, unknown>,
        ).join(", ")}.`,
      );
    }
  }

  return onshapeRequest<OnshapePartMetadata>(path, userKeys, {
    method: "POST",
    body: { jsonType: "metadata-part", partId: partID, properties },
  });
}

async function getAssembly(
  ref: OnshapeBomRef,
  userKeys: UserKeys,
): Promise<OnshapeElementMetadata> {
  const { documentID, wvmType, wvmID, elementID } = ref;
  return onshapeRequest<OnshapeElementMetadata>(
    `/metadata/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}`,
    userKeys,
  );
}

async function updateAssembly(
  ref: OnshapeBomRef,
  data:
    | { properties: Array<{ propertyId: string; value: unknown }> }
    | Record<string, unknown>,
  userKeys: UserKeys,
): Promise<OnshapeElementMetadata> {
  const { documentID, wvmType, wvmID, elementID } = ref;
  const path = `/metadata/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}`;

  let properties: Array<{ propertyId: string; value: unknown }>;

  if (
    "properties" in data &&
    Array.isArray((data as { properties: unknown }).properties)
  ) {
    properties = (
      data as { properties: Array<{ propertyId: string; value: unknown }> }
    ).properties;
  } else {
    const current = await getAssembly(ref, userKeys);
    properties = Object.entries(data as Record<string, unknown>)
      .map(([name, value]) => {
        const match = current.properties.find(
          (p) => p.name?.toLowerCase() === name.toLowerCase(),
        );
        return match ? { propertyId: match.propertyId, value } : null;
      })
      .filter((p): p is { propertyId: string; value: unknown } => p !== null);

    if (properties.length === 0) {
      throw new Error(
        `None of the provided property names matched this assembly's metadata properties`,
      );
    }
  }

  return onshapeRequest<OnshapeElementMetadata>(path, userKeys, {
    method: "POST",
    body: { properties },
  });
}

async function getBom(
  ref: OnshapeBomRef,
  userKeys: UserKeys,
  options: { multiLevel?: boolean; indented?: boolean } = {},
): Promise<OnshapeBillOfMaterials> {
  const { documentID, wvmType, wvmID, elementID } = ref;

  return onshapeRequest<OnshapeBillOfMaterials>(
    `/assemblies/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/bom`,
    userKeys,
    { query: { multiLevel: true, indented: true } },
  );
}

async function onshapeRequestBuffer(
  path: string,
  userKeys: UserKeys,
  options: RequestOptions = {},
): Promise<Buffer> {
  const { method = "GET", body, query } = options;
  let url = buildUrl(path, query);

  for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "*/*",
        ...(body !== undefined
          ? { "Content-Type": "application/json;charset=UTF-8" }
          : {}),
        Authorization: authHeader(userKeys),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new OnshapeApiError(
          `Onshape API binary request redirected without a Location header`,
          response.status,
          undefined,
        );
      }
      url = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {}
      throw new OnshapeApiError(
        `Onshape API binary request failed: ${method} ${path} -> ${response.status}`,
        response.status,
        parsed,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new OnshapeApiError(
    `Onshape API binary request exceeded max redirects`,
    310,
    undefined,
  );
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } {
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      const blockLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + blockLength;
    }
  }

  return { width: 300, height: 300 };
}

async function getElementThumbnail(
  ref: OnshapeBomRef,
  userKeys: UserKeys,
  size: string = "300x300",
): Promise<Buffer> {
  const { documentID, wvmType, wvmID, elementID } = ref;
  return onshapeRequestBuffer(
    `/thumbnails/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/s/${size}`,
    userKeys,
  );
}

async function getPartThumbnail(
  ref: OnshapePartRef,
  userKeys: UserKeys,
  size: string = "300x300",
): Promise<Buffer> {
  const { documentID, wvmType, wvmID, elementID, partID } = ref;
  return onshapeRequestBuffer(
    `/thumbnails/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/p/${partID}/s/${size}`,
    userKeys,
  );
}

async function setElementThumbnail(
  ref: OnshapeBomRef,
  imageBuffer: Buffer,
  userKeys: UserKeys,
  mimeType: string = "image/png",
): Promise<void> {
  const { documentID, wvmID, wvmType, elementID } = ref;
  const { width, height } = getImageDimensions(imageBuffer);
  const base64Image = imageBuffer.toString("base64");

  await onshapeRequest(
    `/thumbnails/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}`,
    userKeys,
    {
      method: "POST",
      body: {
        base64EncodedImage: base64Image,
        mimeType,
        size: `${width}x${height}`,
        imageWidth: width,
        imageHeight: height,
      },
    },
  );
}

async function setPartThumbnail(
  ref: OnshapePartRef,
  imageBuffer: Buffer,
  userKeys: UserKeys,
  mimeType: string = "image/png",
): Promise<void> {
  const { documentID, wvmID, wvmType, elementID, partID } = ref;
  const { width, height } = getImageDimensions(imageBuffer);
  const base64Image = imageBuffer.toString("base64");

  await onshapeRequest(
    `/thumbnails/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/p/${partID}`,
    userKeys,
    {
      method: "POST",
      body: {
        base64EncodedImage: base64Image,
        mimeType,
        size: `${width}x${height}`,
        imageWidth: width,
        imageHeight: height,
      },
    },
  );
}

async function exportPartToStl(
  ref: OnshapePartRef,
  userKeys: UserKeys,
  options: { units?: string; mode?: "ascii" | "binary" } = {},
): Promise<Buffer> {
  const { documentID, wvmType, wvmID, elementID, partID } = ref;
  const { units = "meter", mode = "binary" } = options;

  return onshapeRequestBuffer(
    `/parts/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/partid/${partID}/stl`,
    userKeys,
    { query: { units, mode } },
  );
}

async function exportPartToParasolid(
  ref: OnshapePartRef,
  userKeys: UserKeys,
  options: { version?: number } = {},
): Promise<Buffer> {
  const { documentID, wvmType, wvmID, elementID, partID } = ref;

  return onshapeRequestBuffer(
    `/parts/d/${documentID}/${wvmType}/${wvmID}/e/${elementID}/partid/${partID}/parasolid`,
    userKeys,
    { query: options },
  );
}

async function exportPartToSolidworks(ref: OnshapePartRef, userKeys: UserKeys): Promise<Buffer> {
  const { documentID, wvmType, wvmID, elementID, partID } = ref;

  const translation = await onshapeRequest<{
    id: string;
    requestState: string;
  }>(`/translations/d/${documentID}/${wvmType}/${wvmID}`, userKeys, {
    method: "POST",
    body: {
      formatName: "SOLIDWORKS",
      elementId: elementID,
      partIds: partID,
      storeInDocument: false,
    },
  });

  let state = translation.requestState;
  const translationId = translation.id;

  while (state === "ACTIVE" || state === "PENDING") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await onshapeRequest<{ requestState: string }>(
      `/translations/${translationId}`,
      userKeys,
    );
    state = status.requestState;
    if (state === "FAILED") {
      throw new Error(`Onshape SolidWorks translation failed for part ${partID}`);
    }
  }

  return onshapeRequestBuffer(`/translations/${translationId}/download`, userKeys);
}

export default {
  checkConnection,
  getPart,
  getPartForDb,
  updatePart,
  getBom,
  getAssembly,
  updateAssembly,
  getElementThumbnail,
  getPartThumbnail,
  setElementThumbnail,
  setPartThumbnail,
  exportPartToStl,
  exportPartToParasolid,
  exportPartToSolidworks,
};