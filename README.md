# Demacia BOM

The bill of materials (BOM) tool of the Demacia 5635 FRC robotics team. It connects the robot's Onshape assemblies to a parts database, so the team can see every part and sub-assembly, download its STL and Parasolid files, and track its manufacture through work orders.

The project has three parts:

| Part | What it does | Where it runs |
|---|---|---|
| **Browser extension** (`src/extension`, `src/assembly-extension`, `extension/`) | Shows an assembly's BOM in a side panel next to Onshape. Reads the assembly from Onshape, lets you edit part properties, and **publishes** the BOM: exports each part's thumbnail, STL and Parasolid, uploads them to Google Drive and saves the BOM to the database. | Chrome (side panel) and Firefox (sidebar) |
| **Website** (`src/`) | Shows what has been published: BOMs, part search, work orders and their progress. | GitHub Pages: <https://demacia5635.github.io/Demacia-Bom-app/> |
| **Server** (`server/`) | Express API in front of MongoDB and Google Drive. | Render: <https://demacia-bom-app-n2ag.onrender.com> |

The server never calls Onshape and stores no Onshape API keys. All Onshape reads and writes come from the extension, using the signed-in user's own Onshape session, so they don't count against Onshape's API request limit.

```
Onshape ──(user's browser session)──> Extension ──┐
                                                  ├──> Server ──> MongoDB
                                    Website ──────┘          └──> Google Drive
```

---

# For team members

## Installing the extension (Chrome)

1. Get the latest `demacia-bom-extension-chrome-<version>.zip` from a team developer. It is shared only inside the team.
2. Unzip it to a folder you will keep; Chrome loads the extension from that folder.
3. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the unzipped folder.
4. Pin the extension: click the puzzle icon in the toolbar, then the pin next to **Demacia BOM for Onshape**.

To update, replace the folder's contents with the new zip and click the reload arrow on the extension's card in `chrome://extensions`.

You must be signed in to Onshape in the same browser. The extension sees only documents your Onshape account can open.

## Using it

1. Open an assembly in Onshape.
2. Click the Demacia logo button in Onshape's right-hand sidebar (under BOM Table and the other panel buttons), or the extension's icon in the toolbar. The BOM opens in a side panel.
3. Edit part properties in the panel if needed. Your changes are written to Onshape.
4. Click **Publish BOM** to save the BOM to the team database. This exports each part's thumbnail, STL and Parasolid to the team's Google Drive.

On the website you can then:

- browse published BOMs and download part files,
- search all parts,
- create work orders from a BOM and track each part's manufacturing status.

---

# For developers

## Running it locally

You need Node.js 22 (Vite 8 needs 20.19+ or 22.12+), a MongoDB database, and Google Drive OAuth credentials.

### 1. Server

```bash
cd server
npm install
npm run dev        # tsx watch, listens on http://localhost:5050
```

Create `server/.env` (copy `server/.env.example`, which lists every setting):

```env
PORT=5050
MONGODB_URI=mongodb+srv://...

# Shared secret; clients send it in the x-client-secret header.
CLIENT_SECRET=some-long-random-string

# Extra browser origins allowed to call the API, comma-separated.
# localhost:5173 and localhost:5050 are allowed unless NODE_ENV=production.
ALLOWED_ORIGINS=https://demacia5635.github.io,chrome-extension://ijejpoheiljnajdnanepbkhiegidelkl

# Google Drive (OAuth2 refresh token with Drive scope)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground
GOOGLE_REFRESH_TOKEN=...
GOOGLE_DRIVE_IMAGE_FOLDER_ID=...
GOOGLE_DRIVE_STL_FOLDER_ID=...
GOOGLE_DRIVE_PARASOLID_FOLDER_ID=...
```

### 2. Website and extension settings

Create `.env.local` in the repository root. Both the website and the extension read it at build time:

```env
VITE_CLIENT_URL=http://localhost:5050     # or the Render URL
VITE_CLIENT_SECRET=...                    # must equal CLIENT_SECRET in server/.env
```

`VITE_CLIENT_SECRET` is built into the JavaScript bundle, so anyone with the website or the extension can read it. It keeps out casual callers, not a determined one.

### 3. Website

```bash
npm install
npm run dev        # http://localhost:5173/Demacia-Bom-app/
```

In development, Vite forwards `/api` to `http://localhost:5050`.

### 4. Extension

```bash
npm run build:extension            # Chrome  -> dist-extension/
npm run build:extension:firefox    # Firefox -> dist-extension-firefox/
npm run watch:extension            # Chrome, rebuilt on every change
```

- **Chrome:** `chrome://extensions` → turn on Developer mode → Load unpacked → choose `dist-extension/`.
- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → choose any file in `dist-extension-firefox/`. Temporary add-ons are removed when Firefox restarts.

Then open an assembly in Onshape and click the Demacia logo button in Onshape's right-hand sidebar or the extension's toolbar icon.

`extension/manifest.json` is the Chrome manifest; the Firefox one is generated from it at build time (`vite.extension.config.ts`). The manifest's `key` keeps the Chrome extension ID fixed at `ijejpoheiljnajdnanepbkhiegidelkl`, which the server must allow in `ALLOWED_ORIGINS`.

## Sharing the extension

```bash
npm run package:extension              # build and zip both browsers
npm run package:extension -- chrome    # one browser only (or: firefox)
npm run package:extension -- --no-build
```

The zips go to `publish/<version>/` as `demacia-bom-extension-<browser>-<version>.zip`, next to that version's update log (`v<version>.md`). The zips are git-ignored; the logs are committed. The zips contain the client secret, so share them only inside the team.

## Deployment

- **Website:** every push to `MASTER` runs `.github/workflows/deploy.yml`, which type-checks, builds and publishes `dist/` to the `gh-pages` branch. It needs the repository secrets `VITE_CLIENT_URL` and `VITE_CLIENT_SECRET`. You can also run it by hand from the Actions tab.
- **Server:** hosted on Render and deployed by hand from the Render dashboard. No file in this repository deploys the server; automatic deploys, if wanted, are turned on in Render's service settings (Auto-Deploy). The service's environment variables are the ones in `server/.env` above, with `ALLOWED_ORIGINS` including the website and the extension.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Website dev server |
| `npm run build` / `npm run preview` | Build the website into `dist/` / serve the build |
| `npm run typecheck` | TypeScript check of the website and extension |
| `npm run lint` | oxlint |
| `npm run build:extension[:firefox]` | Build the extension |
| `npm run package:extension` | Build and zip the extension |
| `cd server && npm run dev` | Server with auto-reload |
| `cd server && npm start` | Server without reload |
| `npm run server` | The same, from the repository root (run `npm --prefix server install` once first) |

## API

Every route, with its body and replies, is in [server/API.md](server/API.md). In short: every `/api` route needs the `x-client-secret` header and an allowed origin, except `GET /api` (health check) and `GET /api/drive/file/id/:fileID` (so images load in `<img>` tags).

## Repository layout

```
server/             Express API: routes/, controllers/, models/ (Mongoose), services/driveService.ts
src/                Website (React 19, React Router, Tailwind 4)
  Pages/            BOM list and details, part search, work orders, telemetry
  extension/        Extension background script, Onshape page button, side panel, Onshape access
  assembly-extension/  The assembly BOM page shown in the side panel
  util/             API client, shared models and helpers
extension/          Extension manifest and static files
scripts/            package-extension.mjs
public/             Static files, including privacy.html (the extension's privacy policy)
```

## License

For internal use by the Demacia 5635 robotics team only. Not licensed for use, copying or distribution outside the team.
