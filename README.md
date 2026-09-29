# National Land Acquisition Control Room

A local Smart India Hackathon 2026 prototype for problem statement 26016. The interface follows the proposal's React + TypeScript, Node.js + GraphQL, MySQL, and Leaflet stack. It demonstrates a national project dashboard, acquisition lifecycle tracking, proposal intake, role-gated actions, spatial project locations, delay-risk indicators, and CSV reporting.

## Run locally

Requires Node.js 20 or newer and npm.

```powershell
cd prototype
npm install
npm run dev
```

Open http://127.0.0.1:5173. The GraphQL API is available at http://127.0.0.1:4000/graphql. The default demo uses seeded project data and persists edits in `data/demo-projects.json`, so MySQL is optional for the first run. The vector map and workflow run locally without third-party map or font requests.

Open any project to expand its lifecycle milestones. Every milestone shows a completion date or an estimated date, and authorized roles can add dates, decision notes, and PDF/text supporting files (up to 10 MB each). Project Agency, District Authority, State Authority, and Ministry roles can add milestone evidence; District Authority, State Authority, and Ministry roles can also advance the project stage. Public Viewer is read-only. These selectable demo roles are illustrative, not production authentication.

Uploaded files are stored in `uploads/` with generated filenames; original names and milestone metadata are kept in the local JSON demo state or MySQL. Keep `uploads/` with the database backups when using persistent MySQL data.

## MySQL persistence

Create the database and tables using `database/schema.sql`, then set the connection variables before starting the server:

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "3306"
$env:DB_USER = "root"
$env:DB_PASSWORD = "your-local-password"
$env:DB_NAME = "land_acquisition"
npm run server
```

Alternatively, configure `MYSQL_URL`. When database configuration is present, project, milestone, and attachment metadata use MySQL. Uploaded binary files remain in the local `uploads/` directory. The prototype does not yet provide production identity verification, malware scanning, or government digital-signature validation; add these before deployment with real records.

## GIS and workflow notes

Leaflet displays seeded project coordinates over a lightweight local India outline. To use an existing GeoServer WMS, set `VITE_GEOSERVER_WMS` and optionally `VITE_GEOSERVER_LAYER` before starting Vite. The GraphQL project model stores latitude/longitude to keep this demo easy to seed; a production integration should store parcel boundaries in MySQL spatial columns or PostGIS and publish validated layers through GeoServer. OpenLayers and QGIS fit the proposed desktop authoring and advanced map workflows. Lifecycle stages and sample records are representative demo data, not official land-acquisition records. Delay risk is a transparent rule-based indicator using days in stage and the expected stage deadline, not a trained predictive model.
