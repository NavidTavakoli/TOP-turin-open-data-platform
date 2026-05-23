<!-- THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data. -->
# Security Policy

This repository is a public demo build. Please do not open public issues containing secrets, tokens, private URLs, database dumps, or personally identifiable information.

## Reporting

For security concerns, contact the maintainer privately instead of publishing exploit details in an issue.

## Demo Safeguards

- Real environment values are excluded.
- `.env.example` contains placeholders only.
- API server errors return generic public messages.
- Route planner debug output is disabled unless `ALLOW_ROUTE_DEBUG=true` is explicitly configured.
- Local datasets, downloaded GTFS files, database dumps, and cache folders are ignored by Git.
