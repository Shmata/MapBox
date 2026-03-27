# MapBox SPFx Web Part

An **SPFx (SharePoint Framework) web part** that embeds interactive [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/guides/) maps directly into SharePoint pages. The web part renders a labelled button on the page; clicking it opens a full-featured map interface driven by a project-specific GeoJSON data file.

![SPFx version](https://img.shields.io/badge/SPFx-1.22.2-green.svg)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.14.0%20%3C%2023-blue.svg)
![Mapbox GL JS](https://img.shields.io/badge/mapbox--gl-%5E3.20.0-blue.svg)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Prerequisites](#3-prerequisites)
4. [Setup & Installation](#4-setup--installation)
5. [Configuration](#5-configuration)
6. [Updating Map Content](#6-updating-map-content)
7. [Deployment](#7-deployment)
8. [Troubleshooting & FAQ](#8-troubleshooting--faq)
9. [Contributing](#9-contributing)
10. [License](#10-license)

---

## 1. Project Overview

`ynse-map-report` is a client-side SharePoint Framework web part built with React 17 and Mapbox GL JS. It allows SharePoint site owners to embed a fully interactive, data-driven map into any modern SharePoint page without any server-side code.

The map content is defined by a JSON file (`src/webparts/map/data/map-data.json`) that you replace with your own project data. A valid Mapbox access token is required and is configured through the web part's property pane at edit time — no secrets are ever hard-coded in the deployed package.

**SPFx version:** 1.22.2  
**Applies to:** SharePoint Online (Microsoft 365)

---

## 2. Features

| Feature | Details |
|---|---|
| **Button + description** | Renders a configurable button labelled (default: **Show Map**) on the page alongside a text caption. Clicking the button toggles the map panel open. |
| **Interactive map** | Full Mapbox GL JS map with zoom, pan, and layer interactions powered by `mapbox-gl ^3.20.0`. |
| **Access-token driven** | The Mapbox public token is entered in the property pane and stored as a web part property — it is never committed to source control. |
| **Data-driven content** | Map layers, markers, and metadata are read from a local JSON file (`map-data.json`). Swap the file to change all map content without touching any TypeScript/React code. |
| **Theme aware** | Respects the SharePoint page theme (light/dark) and adjusts element colours automatically. |
| **Teams / Outlook / Office compatible** | Detects the host environment and displays an appropriate message when running inside Microsoft Teams, Outlook, or office.com. |

---

## 3. Prerequisites

### Node.js

This project requires **Node.js ≥ 22.14.0 and < 23.0.0** (as specified in `package.json` `engines` field).  
Use [nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage Node versions:

```bash
nvm install 22
nvm use 22
```

### SharePoint Framework toolchain

The project uses the [Rush Stack Heft](https://heft.rushstack.io/) build system (not Gulp). Install the Heft CLI globally:

```bash
npm install -g @rushstack/heft
```

You also need a **Microsoft 365 tenant** with the SharePoint App Catalog enabled. A free development tenant is available via the [Microsoft 365 Developer Program](http://aka.ms/o365devprogram).

### Mapbox account & access token

1. Sign up (free) at <https://www.mapbox.com/>.
2. Go to **Account → Tokens** and copy your **default public token** (starts with `pk.`).
3. Paste this token in the web part property pane after adding the web part to a page (see [Configuration](#5-configuration)).

---

## 4. Setup & Installation

```bash
# 1. Clone the repository (replace <repository-url> with your clone or fork URL)
git clone <repository-url>
cd MapBox

# 2. Install dependencies
npm install

# 3. Start the local development server (Heft + webpack-dev-server)
npm start
```

`npm start` runs `heft start --clean`, which compiles the project and serves it at `https://localhost:4321`. Open your browser and navigate to your SharePoint workbench:

```
https://<your-tenant>.sharepoint.com/_layouts/15/workbench.aspx
```

Add the **Map** web part from the toolbox, configure the access token in the property pane, and the map will load from the local server.

> **TIP:** The first time you run `npm start`, your browser may warn about an untrusted certificate on `localhost:4321`. Follow the SPFx guidance to [trust the development certificate](https://docs.microsoft.com/sharepoint/dev/spfx/set-up-your-developer-tenant).

### Available scripts

| Command | Description |
|---|---|
| `npm start` | Start local dev server (`heft start --clean`) |
| `npm run build` | Production build + package (`heft test --clean --production && heft package-solution --production`) |
| `npm run clean` | Remove all build artefacts (`heft clean`) |
| `npm run eject-webpack` | Eject the webpack config for advanced customisation |

---

## 5. Configuration

Configuration is done entirely through the web part **property pane** — no environment files or `.env` variables are required.

### Property pane fields

| Property (internal name) | Label in UI | Default value | Purpose |
|---|---|---|---|
| `description` | **Access Token** | `Paste your Mapbox token here` | Your Mapbox public access token (`pk.…`). This is used by Mapbox GL JS to load map tiles. |
| `caption` | **Caption** | `Show Map` | Text label displayed on the toggle button. |

### How to set the access token

1. Edit the SharePoint page that contains the web part.
2. Click the web part to select it, then click the **pencil (edit)** icon.
3. In the property pane that opens on the right, locate the **Token** section.
4. Paste your Mapbox public access token (`pk.eyJ1…`) into the **Access Token** field.
5. Click **Apply** / save the page.

> **Security note:** Mapbox public tokens (prefixed `pk.`) are designed to be included in client-side code and are safe to store as web part properties. Never use a secret token (`sk.`) here.

---

## 6. Updating Map Content

All map data is sourced from `src/webparts/map/data/map-data.json`. To update the map for a new project, replace this file with your own JSON that follows the same schema.

### JSON schema example

The file uses a flat, category-keyed structure. Each category is a top-level key containing an array of location objects. The minimal required fields for a mappable item are `id`, `name`, `lat`, and `lng`.

```json
{
  "metadata": {
    "programme": "My Programme Name",
    "version": "1.0"
  },
  "contracts": {
    "CONTRACT_CODE": {
      "fullName": "Full Contract Name",
      "description": "Human-readable description of this contract.",
      "scope": "Geographic or work scope summary",
      "status": "Active",
      "municipalities": ["City A", "City B"],
      "order": 0
    }
  },
  "stations": [
    {
      "id": "2.1",
      "name": "Example Station",
      "contract": "CONTRACT_CODE",
      "lat": 43.8415,
      "lng": -79.4259,
      "estimated_finished_date": "2030-09-01",
      "catchment": "35,000 people",
      "jobs": "9,000+",
      "peakHour": "1,200 customers",
      "dailyBusTransfers": "1,200",
      "connections": ["Transit Line A"],
      "description": "Narrative description of this station."
    }
  ],
  "eeb": [
    { "id": "1.1", "name": "EEB 1", "contract": "CONTRACT_CODE", "lat": 43.7818, "lng": -79.4159, "estimated_finished_date": "2028-09-01" }
  ],
  "unmapped": [
    { "id": "5.2", "name": "Item without coordinates", "contract": "CONTRACT_CODE", "group": "Group Label", "estimated_finished_date": "2030-12-01" }
  ]
}
```

**Top-level categories in the default file:**

| Key | Description |
|---|---|
| `metadata` | Programme name and schema version |
| `contracts` | Contract definitions (code → full name, description, status, municipalities) |
| `stations` | Subway/transit stations with ridership and connection data |
| `eeb` | Emergency Exit Buildings |
| `cross_passages` | Underground cross passages |
| `tpss` | Traction Power Sub-Stations |
| `headwalls` | Tunnel headwall structures |
| `facilities` | Yards and storage facilities |
| `civil_works` | Shafts, portals, and other civil work items |
| `unmapped` | Work items that have no geographic coordinates (displayed in a list, not on the map) |

> **Note:** `src/webparts/map/data/index.ts` re-exports the JSON and type definitions. Update or regenerate this file if you rename or add top-level categories.

---

## 7. Deployment

### 1. Build the production package

```bash
npm run build
```

This runs `heft test --clean --production` followed by `heft package-solution --production` and produces a `.sppkg` file in the `sharepoint/solution/` directory.

### 2. Upload to the App Catalog

1. Navigate to your tenant App Catalog site:  
   `https://<tenant>.sharepoint.com/sites/appcatalog/AppCatalog/Forms/AllItems.aspx`
2. Drag and drop (or upload) the generated `.sppkg` file.
3. When prompted, check **Make this solution available to all sites in the organisation** if you want tenant-wide deployment, then click **Deploy**.

### 3. Add the web part to a page

1. Go to any modern SharePoint page.
2. Click **Edit** → **+** (add web part) → search for **Map**.
3. Add the web part, enter your Mapbox token in the property pane, and publish the page.

> For detailed guidance see [Deploy your client-side web part to a SharePoint page](https://docs.microsoft.com/sharepoint/dev/spfx/web-parts/get-started/serve-your-web-part-in-a-sharepoint-page).

---

## 8. Troubleshooting & FAQ

### Map does not load / blank map area

**Cause:** The Mapbox access token is missing, expired, or incorrect.  
**Fix:** Edit the web part, open the property pane, and verify the **Access Token** field contains a valid `pk.` token from your Mapbox account. Tokens can be checked and regenerated at <https://account.mapbox.com/access-tokens/>.

### `Error: style is not done loading` or tiles fail to appear

**Cause:** A content security policy (CSP) on the SharePoint tenant is blocking requests to Mapbox tile CDN endpoints.  
**Fix:** Ask your SharePoint/M365 administrator to allow-list the following domains in the tenant CSP or firewall:
- `api.mapbox.com`
- `events.mapbox.com`
- `*.mapbox.com`

### JSON parsing error / map shows no data

**Cause:** The `map-data.json` file contains invalid JSON or a field type mismatch (`lat`/`lng` must be numbers, not strings).  
**Fix:**
1. Validate your JSON with a tool such as [jsonlint.com](https://jsonlint.com/).
2. Ensure `lat` and `lng` values are JSON numbers (e.g., `43.7818`, not `"43.7818"`).
3. Ensure `estimated_finished_date` values follow the `YYYY-MM-DD` format.

### CORS errors in the browser console

**Cause:** The local development server (`localhost:4321`) cannot reach external resources, or the SharePoint workbench is blocked from loading local scripts.  
**Fix:** Trust the SPFx development certificate by following the [official certificate trust guide](https://docs.microsoft.com/sharepoint/dev/spfx/set-up-your-developer-tenant) for your Node.js and Heft version.

### Web part does not appear in the toolbox

**Cause:** The solution has not been deployed to the App Catalog, or app deployment is still pending.  
**Fix:** Confirm the `.sppkg` was uploaded and **deployed** (not just uploaded) in the App Catalog. Allow a few minutes for propagation.

---

## 9. Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes and ensure the project builds: `npm run build`.
4. Commit with a clear message: `git commit -m "feat: describe your change"`.
5. Push the branch and open a Pull Request against `main`.

Please keep PRs focused on a single concern and include a description of what changed and why.

---

## 10. License

No license is currently specified in this repository.  
It is strongly recommended to add a `LICENSE` file (e.g., MIT or Apache 2.0) to clarify usage rights for contributors and consumers.

---

## References

- [Getting started with SharePoint Framework](https://docs.microsoft.com/sharepoint/dev/spfx/set-up-your-developer-tenant)
- [Mapbox GL JS documentation](https://docs.mapbox.com/mapbox-gl-js/guides/)
- [Rush Stack Heft documentation](https://heft.rushstack.io/)
- [Microsoft 365 Patterns and Practices](https://aka.ms/m365pnp)
- [SPFx web part deployment guide](https://docs.microsoft.com/sharepoint/dev/spfx/web-parts/get-started/serve-your-web-part-in-a-sharepoint-page)
