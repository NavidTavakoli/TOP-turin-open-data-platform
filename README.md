# TOP — Turin Open Data Platform
A production-like, 100% free data product for Turin (ETL + PostgREST API + Pages UI).

## Stack
- Ingestion: GitHub Actions (cron batch)
- Storage/API: Supabase (Postgres + PostgREST) with RLS
- Frontend: Cloudflare Pages (React + Leaflet)

## Quick Start
1) Supabase schema & RLS applied (done).
2) Set GitHub Actions secrets: POSTGREST_URL, SERVICE_KEY.
3) Push and enable the scheduled ETL workflow.
EOF
