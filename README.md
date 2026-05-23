# **TOP – Turin Open Data Platform**

> **A near real-time smart city data platform for Turin, Italy — turning open urban data into live KPIs, public transport intelligence, and interactive city dashboards.**

[![ETL](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-etl.yml/badge.svg)](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-etl.yml)
[![Reddit](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-reddit.yml/badge.svg)](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-reddit.yml)
[![Traffic Purge](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-purge-traffic.yml/badge.svg)](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-purge-traffic.yml)
[![Purge Env](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-purge-env.yml/badge.svg)](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-purge-env.yml)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Frontend: React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB.svg)
![Backend: Cloudflare](https://img.shields.io/badge/Backend-Cloudflare%20Pages%20Functions-F38020.svg)
![Database: Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E.svg)
![Transit: GTFS](https://img.shields.io/badge/Transit-GTFS%20%2B%20GTFS--RT-blue.svg)

**Live Demo:** [navidtavakolishalmani.com/city-dashboard](https://navidtavakolishalmani.com/city-dashboard)

---

## **System Architecture**

![Architecture](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/Architecture.png)

---

## **Overview**

**TOP – Turin Open Data Platform** is a real-world prototype of a **smart city KPI and mobility data platform** for Turin, Italy. The project demonstrates how open urban data can be collected, cleaned, stored, served through APIs, and transformed into an interactive public dashboard.
![Demo 001](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/Demo%20001.png)
The platform integrates multiple urban data streams — including **public transport**, **traffic**, **weather**, **air quality**, and **local community signals** — into a single near real-time interface. Its goal is to show how modern data engineering can turn fragmented city data into actionable KPIs for citizens, researchers, city planners, transport authorities, and sustainability teams.

The project runs as a lightweight serverless architecture:

- **React + Vite frontend** deployed on **Cloudflare Pages**
- **TypeScript edge APIs** using **Cloudflare Pages Functions**
- **Supabase PostgreSQL** as the central urban data warehouse
- **GitHub Actions** for automated ETL and GTFS data synchronization
- **GTFS static + GTFS-RT** for public transport schedule and live updates

---

## **Why I Built This Project**

Smart city dashboards often focus only on visualization. This project goes further: it demonstrates the complete data lifecycle behind an urban analytics platform.

It covers:

- automated ingestion from public APIs
- PostgreSQL data modeling
- edge API development
- public transport schedule processing
- route candidate generation
- KPI visualization
- deployment and production debugging
- dashboard UX for real users

The project is designed as a portfolio-grade example of how data engineering, cloud deployment, and urban analytics can work together in a practical smart city application.

---

## **Core Features**

### **GTT Public Transit Planner**

A custom public transport route planner for Turin's GTT network. Since GTT does not provide a public routing API, the planner is built directly on top of GTFS static schedule data and GTFS-RT live updates.
![Demo 003](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/Demo%20003.png)
It supports:

- direct routes
- one-transfer routes
- bus, tram, and metro lines
- walking transfers between nearby stops or stations
- schedule-aware route generation
- route ranking by duration, waiting time, walking distance, and mode
- filtering of low-value transfer routes
- interactive route visualization on Leaflet maps

The planner can generate Google-like options such as:

- direct bus routes
- direct tram/bus routes
- metro-to-bus transfers
- bus-to-bus transfers
- walking transfers between nearby stops

It also removes weak candidate routes such as tiny 1–3 minute feeder rides followed by long waits when a direct line is already available.

---

### **Live Stop Arrivals**

Users can search any GTT stop by name or code and see upcoming arrivals.

The arrival module combines:

- static GTFS schedules
- GTFS-RT real-time delay data
- fallback handling when live updates are unavailable
- stop search and nearby stop discovery

This makes the dashboard useful not only as an analytics interface, but also as a practical mobility tool.

---

### **Traffic Flow KPIs**

Traffic data is collected from the 5T Piemonte source and transformed into city mobility indicators.

The dashboard shows:

- average road speed
- number of monitored segments
- congestion severity levels
- top traffic jams
- free / moderate / busy / heavy / jam categories
- mobility trend visualizations

---

### **Air Quality Monitoring**

The dashboard displays air quality conditions for Turin using AQI and pollutant-level KPIs.

Included indicators:

- AQI score
- PM2.5
- PM10
- NO₂
- O₃
- SO₂
- CO

The UI presents the data using gauge-style visualizations and status categories to make the information easy to interpret.

---

### **Weather KPIs**

Weather data is collected and displayed as live environmental indicators.

Included metrics:

- temperature
- humidity
- wind speed
- precipitation
- cloud cover
- short-term historical trends

Weather is combined with other urban KPIs to provide a broader view of the city context.

---

### **Reddit Torino Feed**

The platform also collects recent posts from **r/Torino** to include a lightweight social signal layer.

This is useful for capturing:

- local discussions
- public sentiment
- mobility or city-related complaints
- community events
- emerging topics

The Reddit feed is cached server-side to avoid unnecessary repeated API requests.

---

## **Engineering Highlights**

- Built a custom GTFS-based route planner for Turin because no public GTT routing API is available.
- Supports direct and one-transfer journeys across bus, tram, and metro lines.
- Handles walking transfers between nearby stops and stations, not only exact same-stop transfers.
- Combines static GTFS schedules with GTFS-RT live updates where available.
- Uses schedule-aware candidate generation and service-day filtering.
- Implements route scoring, deduplication, diversity selection, and quality filtering.
- Removes low-value transfer routes such as tiny feeder rides followed by long waits.
- Enriches transit legs with GTFS stop sequences and shape geometry for map visualization.
- Uses a staging-to-production sync pattern for safe GTFS data updates.
- Runs fully serverless on Cloudflare Pages Functions with Supabase/PostgreSQL as the data backend.
- Includes automated ETL workflows and scheduled maintenance jobs through GitHub Actions.

---

## **Data Sources**

| Domain | Source | Purpose |
|---|---|---|
| Public transport | GTT GTFS static feed | Stops, lines, schedules, trips, stop sequences, shapes |
| Real-time transit | GTT GTFS-RT feed | Trip updates and live delay information |
| Weather | Open-Meteo API | Current weather and historical weather metrics |
| Air quality | WAQI API | AQI and pollutant indicators |
| Traffic | 5T Piemonte API | Road speed, congestion, and traffic flow |
| Community signals | Reddit r/Torino | Local posts and citizen discussion signals |

---



---

## **Transit Planner – How It Works**

The route planner is the most complex part of the project. It is built from raw GTFS schedule data rather than a third-party routing API.

Given an origin and destination coordinate pair, the planner:

1. Finds nearby origin and destination stops within a configurable search radius.
2. Identifies which GTT lines serve those stops using `gtt_stop_lines`.
3. Expands the search to stops reachable by origin-side lines and destination-side lines.
4. Builds transfer pairs using both:
   - exact same-stop transfers
   - walking transfers between nearby stops or stations
5. Fetches schedule data from `gtt_stop_schedules`.
6. Filters schedule entries by active service day and departure time window.
7. Allows metro schedules through a special time-window safeguard when service IDs are not returned by the active-service RPC.
8. Builds direct route candidates from trips that connect origin-side stops to destination-side stops.
9. Builds one-transfer candidates by combining first-leg arrivals with second-leg departures.
10. Rejects same-line transfers such as `42 → 42`.
11. Scores candidates using duration, walking distance, transfer wait, departure delay, and transit mode.
12. Deduplicates candidates by exact transit leg and departure bucket.
13. Selects a diverse final set of line chains.
14. Applies quality filters to remove weak routes such as tiny feeder rides followed by long waits.
15. Enriches transit legs with stop-sequence and shape geometry for map rendering.

---

## **Route Quality Filtering**

Raw transit routing can generate many technically valid but user-unfriendly options. The planner therefore includes final quality filters.

Examples of routes that are removed:

- same-line transfers such as `42 → 42`
- transfers where the first ride is only 1–3 minutes followed by a long wait
- routes where a direct line already exists and the transfer option is slower
- duplicate line chains with similar departure times
- transfer routes with excessive walking distance
- low-value feeder transfers into a direct line

This makes the final output closer to what users expect from a real transit planner.

---

## **GTFS Data Model**

The project stores GTFS-derived data in Supabase under the `api` schema.

Core tables include:

| Table | Purpose |
|---|---|
| `gtt_stops` | Stop metadata and coordinates |
| `gtt_stop_lines` | Mapping between stops and served lines |
| `gtt_stop_schedules` | JSONB schedule entries per stop |
| `gtt_trip_stop_sequences` | Ordered stop sequences per trip |
| `gtt_shapes` | GTFS shape geometry for map rendering |
| `gtt_calendar` | Regular service calendar |
| `gtt_calendar_dates` | Service exceptions |

The schedule table stores compact JSONB entries to reduce storage overhead while keeping route planning queries fast enough for edge functions.

---

## **GTFS Sync Pipeline**

GTT publishes a static GTFS zip that is updated periodically. A Node.js sync script downloads, parses, and loads the data into Supabase.

The sync uses a **staging → atomic swap** strategy:

1. Download GTFS zip.
2. Parse stops, routes, trips, stop times, calendars, and shapes.
3. Load data into staging tables.
4. Validate row counts and structure.
5. Swap staging tables into production.
6. Keep API reads consistent during updates.

Example commands:

```bash
node scripts/sync-gtt-stops.cjs --sync-schedules-full
node scripts/sync-gtt-stops.cjs --sync-trip-sequences
node scripts/sync-gtt-stops.cjs --sync-schedules-full --dry-run
```

A GitHub Actions workflow runs the full sync automatically and can also be triggered manually.

Approximate sync scale:

- ~7,000 stops
- ~1.28M schedule entries
- ~43,000 trip sequences
- GTFS shapes for route visualization
- ~47MB stored in Supabase after compression

---

## **ETL and Automation Workflows**

All scheduled pipelines are managed by GitHub Actions.

| Workflow | Purpose |
|---|---|
| `cron-etl.yml` | Fetches weather, air quality, traffic, and other urban KPI data |
| `cron-reddit.yml` | Collects recent Reddit posts from r/Torino |
| `cron-purge-traffic.yml` | Removes stale traffic records to control storage growth |
| `cron-purge-env.yml` | Removes outdated environmental records |
| GTFS sync workflow | Updates GTT static transit data on a schedule or manually |

Pipeline flow:

![DataPlatform](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/DataPlatform.png)

---

## **Tech Stack**

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4 |
| Maps | Leaflet, react-leaflet |
| Charts | Apache ECharts, Recharts |
| Animation | Framer Motion |
| Backend API | Cloudflare Pages Functions, TypeScript |
| Database | Supabase PostgreSQL, PostgREST, `api` schema |
| ETL / Sync | Node.js scripts, GitHub Actions |
| Transit | GTFS static feed, GTFS-RT real-time feed |
| Deployment | Cloudflare Pages |
| Version control | GitHub |

---

## **Repository Structure**

```text
city-dashboard/
├── functions/
│   └── api/v1/
│       ├── gtt/
│       │   ├── arrivals.ts
│       │   ├── stops.ts
│       │   ├── trip-updates.ts
│       │   └── routes/plan.ts
│       ├── traffic/
│       ├── weather/
│       └── air-quality/
├── scripts/
│   └── sync-gtt-stops.cjs
├── src/
│   ├── components/
│   │   ├── GttStatusCard.jsx
│   │   ├── TrafficMixCard.jsx
│   │   ├── AqiGaugeECharts.jsx
│   │   └── RedditFeed.jsx
│   └── App.jsx
├── public/
├── package.json
└── vite.config.js
```

---

## **Getting Started**

### **Prerequisites**

- Node.js 22+
- npm
- Supabase project
- Cloudflare account
- GTT GTFS data source

### **Install**

```bash
git clone https://github.com/NavidTavakoli/NavidTavakoli.github.io
cd NavidTavakoli.github.io/city-dashboard
npm install
```

### **Environment Variables**

Create `.env` inside `city-dashboard/`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Set the same variables in Cloudflare Pages:

```text
Settings → Environment Variables
```

### **Run Locally**

Frontend only:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Run Pages Functions locally with Wrangler:

```bash
npm run build
npx wrangler pages dev dist
```

---

## **Deployment**

The project is deployed with Cloudflare Pages.

Recommended Cloudflare build configuration:

```text
Root directory: city-dashboard
Build command: npm run build
Build output directory: dist
Production branch: main
```

Push to `main` to trigger automatic deployment.

---

## **Why This Project Matters**

Smart cities need more than open data. They need systems that transform raw data into reliable, understandable, and actionable indicators.

This project shows how a city can move from disconnected data sources to an integrated urban intelligence layer.

Potential use cases:

- **City planners** can monitor mobility and congestion patterns.
- **Transport authorities** can analyze public transport accessibility and service quality.
- **Environmental teams** can track weather and pollution conditions.
- **Researchers** can use integrated city datasets for modeling and analysis.
- **Citizens** can access useful, real-time information in a single interface.

TOP demonstrates how near real-time pipelines, cloud databases, edge APIs, and modern dashboards can support smarter urban decision-making.

---

## **Portfolio Value**

This project demonstrates practical skills across the full data engineering lifecycle:

- API ingestion
- ETL automation
- PostgreSQL modeling
- GTFS schedule processing
- geospatial reasoning
- serverless API development
- frontend data visualization
- production deployment
- debugging real cloud issues
- route ranking and data-quality filtering

It is not only a dashboard; it is an end-to-end urban data product.

---

## **Roadmap**

Planned improvements:

- Add more detailed historical KPI trends.
- Add route comparison metrics for public transport options.
- Add sentiment analysis for Reddit posts.
- Add congestion heatmaps.
- Improve GTFS-RT delay integration in the route planner.
- Add more open datasets such as energy, bike sharing, and parking.
- Add documentation for database schema setup.

---

## **Acknowledgements**

- Supabase for PostgreSQL hosting and PostgREST APIs
- Cloudflare Pages for edge deployment
- GitHub Actions for automation
- Open-Meteo for weather data
- WAQI for air quality data
- 5T Piemonte for traffic data
- GTT for GTFS and GTFS-RT public transport data
- OpenStreetMap contributors for map data

---

## **License**

This project is distributed under the **MIT License**. See the license file for details.

---

Produced by **[Navid Tavakoli Shalmani](https://navidtavakolishalmani.com/)**

*This project is under active development.*
