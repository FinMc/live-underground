# Live Underground

A live map of London Underground / DLR / Elizabeth line trains, built on the TfL Unified API.

## Project layout

- `/` — the React frontend, built with [Vite](https://vite.dev/).
- `/server` — the Flask backend (`arrivals.py`) that proxies and aggregates TfL arrivals data.

Requires Node 24 (see `.nvmrc` / `engines` in `package.json`).

Both are deployed together as one Vercel project using [Vercel Services](https://vercel.com/docs/services): the frontend is served at `/`, and requests to `/tfl/*` are routed to the Flask backend (see `vercel.json`).

## Backend setup

The backend calls the TfL Unified API and needs an API key from [api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk/).

1. Copy `server/.env.example` to `server/.env` and fill in `TFL_APP_KEY`.
2. In the Vercel project's Environment Variables settings, add `TFL_APP_KEY` with the same value.

## Local development

Run the backend:

```bash
cd server
pip install -r requirements.txt
python arrivals.py   # serves http://localhost:5000
```

In another terminal, run the frontend (Vite proxies `/tfl/*` requests to `http://localhost:5000`, see `vite.config.js`):

```bash
yarn install
yarn start   # serves http://localhost:5173
```

Alternatively, `vercel dev` runs both services together the same way they run in production.

## Deploying

Push to the connected Git repository, or run `vercel deploy`. Vercel builds the frontend and backend as separate services from the same project and wires them together per `vercel.json`.

