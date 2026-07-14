# CityDB v1.0 — Release Notes & Production Checklist

## Production Readiness Report

| Category | Status | Notes |
|----------|--------|-------|
| Build | ✅ Clean | `npm run build` — 0 TypeScript errors |
| Category | Status | Notes |
|----------|--------|-------|
| Build | ✅ Clean | `npm run build` — 0 TypeScript errors |
| Tests | ✅ 37 passing | 4 test files: translator, validation, health, postgres |
| Health check | ✅ `/health` → `{ status: "ok" }` | Railway-compatible |
| Graceful shutdown | ✅ SIGTERM + SIGINT | 10s drain timeout |
| Structured logging | ✅ JSON to stdout/stderr | Railway log aggregation compatible |
| Environment variables | ✅ All Railway vars supported | PORT, DATABASE_URL, NODE_ENV, CLIENT_URL |
| SSL (PostgreSQL) | ✅ Auto-detected | `sslmode=require` if URL ends with `railway.internal` or `neon.tech` |
| Connection pool | ✅ pg-pool with max:20 | Exponential backoff retry on startup |
| Security headers | ✅ Helmet | All recommended headers |
| CORS | ✅ CLIENT_URL restricted in production | |
| Rate limiting | ✅ 120 req/min per IP on /api | |
| Source maps | ✅ Hidden in production | `.map` files not referenced in bundle |
| SQL injection prevention | ✅ Parameterized queries only | |
| SELECT-only enforcement | ✅ Production mode | DEVELOPMENT_MODE required for DDL/DML |
| Read-only transactions | ✅ BEGIN READ ONLY | Wraps every EXPLAIN ANALYZE |
| Explain-only mode | ✅ /api/query/explain-only | No query execution, safe for all queries |
| Error boundaries | ✅ Root + Canvas level | No unhandled crashes |
| WebSocket reconnect | ✅ Exponential backoff | 500ms → 30s cap |
| Query history | ✅ localStorage | Persists across reloads |
| Saved queries | ✅ localStorage | Named, up to 50 entries |
| Performance dashboard | ✅ Complete | Buffers, temp writes, heap fetches, I/O pressure |
| Plan tree | ✅ Collapsible | All operators covered with explanations |

---

## v1.0 Changelog

### New Features
- **Explain-only mode** (`📋 Explain` button) — runs `EXPLAIN (FORMAT JSON)` without executing the query. Cost estimates only. Safe for any table size. `explainOnly: true` propagated through IR to all UI panels.
- **Named saved queries** — save any SQL with a custom name. Persists in `localStorage` (up to 50 entries). Load by clicking the name in the panel.
- **Collapsible plan tree nodes** — each plan node with children has a ▼/▶ toggle. Collapsed nodes show child count. Makes large multi-join plans readable.
- **Format SQL** button (⌫) — normalizes whitespace and trims the editor content.
- **I/O Pressure badge** in Performance Dashboard — color-coded green/blue/yellow/red based on shared read blocks.
- **Missing metrics** in Performance Dashboard — `tempWrittenBlocks`, `heapFetches`, parallel workers planned/launched now displayed.

### Bug Fixes & Hardening
- Fixed `moduleResolution: "Bundler"` → `"NodeNext"` in backend `tsconfig.json` for strict Node.js ESM compliance.
- Removed inline `<style>` from `App.tsx` — moved to `index.css` with proper CSS custom properties.
- Added root-level `ErrorBoundary` in `main.tsx` — prevents white-screen on catastrophic App failures.
- Fixed production sourcemap leak — now `"hidden"` in production builds.
- Fixed `clearTimeline` dead export — removed from `useCityDB` interface.
- Replaced `console.log` in `seed.ts` with structured `logger.info`/`logger.error`.
- `PostgresPlanNode.Actual*` fields marked optional — matches real EXPLAIN output types.
- Explain-only IR: `Planning Time` and `Execution Time` default to 0 in explain-only plans.

### Documentation
- Updated `README.md` — explain-only mode, saved queries, collapsible plan tree, updated API reference, 37-test count.
- `RELEASE.md` — production readiness matrix and deployment checklist (this file).

### Tests
- 12 new tests added across translator, validation, health, and postgres (37 total passing tests)
- Expanded `translator.test.ts` with fixtures covering all 17 required PostgreSQL operators: `Seq Scan`, `Index Scan`, `Index Only Scan`, `Bitmap Heap Scan`, `Bitmap Index Scan`, `Nested Loop`, `Hash Join`, `Merge Join`, `Sort`, `Aggregate`, `Limit`, `Append`, `Materialize`, `Gather`, `Gather Merge`, `Hash`, `Unique`.
- New `postgres.test.ts` — classifyScale edge cases
- New translator explain-only test — verifies zero-timing plans produce valid IR with `explainOnly: true`


---

## Deployment Checklist

### Railway
- [ ] `DATABASE_URL` variable is linked to a Railway PostgreSQL service
- [ ] `NODE_ENV=production` is set
- [ ] `CLIENT_URL` is set to your Railway app URL (for strict CORS)
- [ ] Railway health check path is `/health` (already configured in `railway.json`)
- [ ] Railway build command: `npm run build` (already configured)
- [ ] Railway start command: `npm start` (already configured)
- [ ] After deploy: run `npm run seed` with production `DATABASE_URL` once

### Pre-Deploy Verification
```bash
# Local
npm install
npm run build      # Must succeed with 0 errors
npm run test       # Must pass 33 tests
npm start          # Server must start and log: { "msg": "server_ready" }

# Verify health endpoint
curl http://localhost:4000/health
# Expected: {"status":"ok"}
```

### Post-Deploy Verification
- [ ] `GET /health` returns `{"status":"ok"}` with HTTP 200
- [ ] `GET /api/metadata` returns PostgreSQL version info
- [ ] `POST /api/query` with `{"sql":"SELECT 1"}` returns a valid timeline
- [ ] `POST /api/query/explain-only` with `{"sql":"SELECT 1"}` returns IR with `explainOnly: true`
- [ ] WebSocket `/ws` connects and responds to `{"type":"get_city"}`
- [ ] Frontend 3D canvas renders
- [ ] Query execution animates the city

---

## Known Limitations

See `README.md` for the current known limitations list.

---

## Security Notes for Production

- Do **not** set `DEVELOPMENT_MODE=true` in production — this allows DDL/DML queries.
- If CityDB is exposed to the internet, place it behind a reverse proxy with authentication (e.g., Nginx basic auth, Cloudflare Access, or similar).
- CityDB is designed as a development/educational tool. It has no user authentication by design.
