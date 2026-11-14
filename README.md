# BOM App — CAD, Inventory & Production Management Platform

An integrated enterprise platform linking **Onshape CAD models**, **MongoDB inventory/parts databases**, **Google Drive asset storage**, and **Work Order manufacturing tracking**.

---

## 📋 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Installation & Execution](#installation--execution)
- [API Route Structure](#api-route-structure)
- [CAD & Onshape Integration](#cad--onshape-integration)
- [Google Drive Integration](#google-drive-integration)
- [Recent Bug Fixes & Code Audit Summary](#recent-bug-fixes--code-audit-summary)
- [License](#license)

---

## 🔍 Overview

The **BOM App** bridges computer-aided design (CAD) workflows in Onshape with real-world inventory management and manufacturing execution. It allows engineering and shop-floor teams to:
- Pull parts and Bill of Materials (BOM) hierarchy directly from Onshape.
- Track manufacturing status, material attributes, vendor pricing, and CAD exports (STL, Parasolid, SolidWorks).
- Assign work orders and monitor sub-part manufacturing progress across shop floor teams.
- Store thumbnail renders and attachments seamlessly in Google Drive.

---

## ✨ Key Features

- **Onshape CAD Synchronization:**
  - Dynamic metadata extraction (`name`, `catalogNumber`, `revision`, `material`, `price`, `vendor`, `description`, `engineer`).
  - Native Onshape composite key support (`/d/:documentID/wvmT/:wvmType/wvmI/:wvmID/e/:elementID/p/:partID`).
  - Multi-level assembly BOM hierarchy resolution.
  - Automatic thumbnail generation and binary upload with header dimension auto-detection (PNG/JPEG).
  - Multi-format CAD exports: STL (units/mode configuration), Parasolid (`.x_t`/`.x_b`), and asynchronous SolidWorks (`.sldprt`) translation job polling.

- **Inventory & Part Management:**
  - Centralized MongoDB schemas for parts and assembly items.
  - Automatic Onshape property mapping (`PART_PROPERTY_ID_MAP`).
  - Associated CAD export links (`stlLink`, `parasolidLink`) and avatar/thumbnail references.

- **Work Order & Manufacturing Tracking:**
  - Work Order tracking with sub-part level breakdown.
  - Status codes and owner assignments for both GC (General Contractor) and Making/Manufacturing teams.
  - Automated progress aggregation for complex multi-part subassemblies.

- **Google Drive Integration:**
  - OAuth2 service account / refresh token integration.
  - Files sorted into folders by type: thumbnails (`GOOGLE_DRIVE_IMAGE_FOLDER_ID`), STL (`GOOGLE_DRIVE_STL_FOLDER_ID`) and Parasolid (`GOOGLE_DRIVE_PARASOLID_FOLDER_ID`).
  - Binary streaming uploads, file metadata indexing, and attachment management.

---

## 🛠 Tech Stack

### Backend
- **Runtime:** Node.js & Express v5
- **Language:** TypeScript 5.7+
- **Database:** MongoDB & Mongoose v9
- **Integrations:** Onshape Glassworks REST API, Google Drive API (`googleapis` v3)
- **Utilities:** `dotenv`, `cors`, `node-fetch` / Native `fetch`

### Frontend
- **Framework:** React v19 + Vite
- **Styling:** Tailwind CSS v4
- **Routing & UI:** React Router DOM v7, Lucide React Icons

---

## 🚀 Getting Started

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **MongoDB:** Active MongoDB instance (Local or Atlas)
- **Google Cloud Console:** OAuth2 Client ID, Client Secret, and Refresh Token with Drive API scope.

### Environment Variables
Create a `.env` file in the root directory:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/bom-app

# Google Drive API Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
GOOGLE_DRIVE_IMAGE_FOLDER_ID=your_image_folder_id
GOOGLE_DRIVE_STL_FOLDER_ID=your_stl_folder_id
GOOGLE_DRIVE_PARASOLID_FOLDER_ID=your_parasolid_folder_id
```

### Installation & Execution

```bash
# Install dependencies
npm install

# Run backend development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🔌 API Route Structure

| Mount Point | Sub-Route | Method | Description |
| :--- | :--- | :--- | :--- |
| `/api/` | `/` | GET | Health check |
| `/api/db` | `/` | GET | MongoDB Connection Check |
| `/api/db/part` | `/all`, `/id/:id`, `/d/.../p/:partID` | GET/POST/DEL | Part CRUD (also looked up by Onshape identity) |
| `/api/db/bom` | `/all`, `/id/:id`, `/d/.../e/:elementID` | GET/POST/DEL | BOM CRUD & Assembly operations |
| `/api/db/workOrder` | `/all`, `/id/:id` | GET/POST/DEL | Work Order production management |
| `/api/enum` | `/productionType/*`, `/status/*` | GET | Enums for status & production classification |
| `/api/drive` | `/file/*`, `/folder/*` | GET/POST/DEL | Google Drive file manipulation |

---

## 📐 CAD & Onshape Integration

The server never calls Onshape and stores no Onshape API keys or user accounts. Onshape is read and written by the **Chrome extension** (`src/extension`, built with `npm run build:extension`), using the signed-in user's own Onshape browser session, so its requests don't count against Onshape's yearly API limit:

- **Refresh BOM:** reads the assembly tree, properties and live part/assembly renders from Onshape.
- **Publish BOM:** writes edited properties to Onshape, exports each part's thumbnail, STL (binary, meters) and Parasolid (`.x_t`), uploads them through `/api/drive`, and saves the BOM and parts to MongoDB.

The website shows what has been published to the database.

---

## 📁 Google Drive Integration

`driveService.ts` handles asset attachment and document storage:
- Uploads go to the image, STL or Parasolid folder by file type (`folderForUpload`).
- Supports streaming binary uploads (`express.raw`), file deletion, metadata inspection, and custom folder structures.

---

## 🛠 Recent Bug Fixes & Code Audit Summary

Across 6 auditing batches, critical bugs were resolved:
1. **`WorkOrder.ts` Schema:** Corrected misspelling `quantityToal` -> `quantityTotal` to prevent Mongoose from discarding user quantity updates.
2. **`onshapeController.ts` Buffer Check:** Fixed global `Buffer` reference typo (`"data" in Buffer` -> `"data" in buffer`).
3. **HTTP 204 Responses:** Resolved hanging connections by appending `.send()` to `res.status(204)`.
4. **Export Endpoints:** Added missing `return` statements on 404 paths to prevent `ERR_HTTP_HEADERS_SENT` server crashes.
5. **Parameter Mutation in `partController.ts`:** Saved `req.params` prior to mutation during `upsertPartByOnshapeKey` calls.
6. **Route Typo in `bomRoutes.ts`:** Corrected method reference `getBomByOnsahpeKey` -> `getBomByOnshapeKey`.
7. **Google Drive API Field Error in `driveService.ts`:** Removed invalid field `blob` from Drive API query parameters.
8. **Options Preservation in `getBom`:** Fixed hardcoded flags in `onshapeService.ts` to allow caller options (`multiLevel`, `indented`).

---

## 📄 License

Internal Enterprise License — Reserved for system maintenance and authorized FRC / Industrial project use.
