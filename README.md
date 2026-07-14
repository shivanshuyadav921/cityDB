# CityDB

**Real-time PostgreSQL execution visualization platform.**

CityDB translates PostgreSQL query execution plans into an animated 3D city. Every building, road, and bridge corresponds to a real database object. Every animation corresponds to real query execution data from `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

Nothing is simulated. Everything comes from PostgreSQL.

---

## Screenshots

> Run a query → watch PostgreSQL execute it as a living city animation.

```
┌─────────────────────────────────────────────────┐
│  SQL Editor           │   3D City               │
│  ─────────────────    │   (Three.js / R3F)      │
│  ▶ Execute            │                         │
│  📋 Explain (cost)    │   Districts = Tables    │
│  💾 Save Query        │   Buildings = Rows      │
│  Query History        │   Roads = Indexes       │
│                       │   Bridges = Foreign Keys│
│  Plan Tree            │                         │
│  (clickable, collapse)│   Execution HUD         │
│                       │                         │
│  Performance Dashboard│   (all real metrics)    │
└─────────────────────────────────────────────────┘
```

---

## Architecture

```
Browser (React + Three.js)
    │
    │  WebSocket /ws  (or REST /api for fallback)
    ▼
Express Server (Node.js)
    │  EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    │  EXPLAIN (FORMAT JSON)               ← explain-only mode
    ▼
PostgreSQL
    │
    └── translator.ts converts PG plan nodes → Visualization IR
        Frontend renderer only sees IR types (scan/beam/fold/...)
        — never raw PostgreSQL node names
```

### Visualization IR

The IR is the **only contract** between backend and frontend:

| IR Type     | PostgreSQL Operator            | City Visual         |
|-------------|-------------------------------|---------------------|
| `scan`      | Seq Scan                      | Crawl through district |
| `beam`      | Index Scan / Index Only Scan  | Direct beam down road |
| `bitmap`    | Bitmap Heap/Index Scan        | Heatmap then sweep  |
| `traffic`   | Nested Loop Join              | Door-to-door walk   |
| `fold`      | Hash Join                     | Hash table build    |
| `zipper`    | Merge Join                    | Lockstep zip        |
| `sort`      | Sort                          | Reorder buildings   |
| `aggregate` | Aggregate / Gather            | Cluster into tower  |
| `limit`     | Limit                         | Early cutoff        |
| `result`    | Result / ModifyTable          | Output pulse        |

---

## Quick Start (Local)

### Prerequisites
- Node.js >= 20
- Docker (for PostgreSQL)

### 1. Start PostgreSQL

```bash
docker-compose up -d postgres
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env if needed — defaults work with docker-compose
```

### 4. Seed the database (one time)

```bash
npm run seed
```

This creates a `users` table with 100,000 rows and a demo row at `alice@example.com`.

### 5. Start the backend

```bash
npm run dev:backend
# or: cd backend && npm run dev
```

### 6. Start the frontend (separate terminal)

```bash
npm run dev
# or: cd frontend && npm run dev
```

Visit `http://localhost:5173`

---

## Demo Script

1. **Run the default query** — watch a Sequential Scan crawl across the district building-by-building.

2. **Click 📋 Explain** — see PostgreSQL's cost estimates without executing the query. Safe for any query, including large tables.

3. **Create an index** — paste into the editor (requires `DEVELOPMENT_MODE=true`):
   ```sql
   CREATE INDEX idx_users_email ON users(email)
   ```

4. **Re-run the original query** — observe how it switches to an Index Scan beam.

5. **Enable Compare Mode** — in settings, enable split screen. Set the first run as baseline to see the execution time delta.

6. **Hover plan tree nodes** — see the corresponding city district highlight and an explanation of why PostgreSQL chose that operator.

7. **Collapse plan nodes** — click ▼/▶ on any plan tree node to collapse/expand its subtree.

8. **Save queries** — type a name and click 💾 Save to persist any SQL to your browser's saved query list.

---

## Railway Deployment

### Step 1: Create a Railway project

1. Go to [railway.app](https://railway.app) → New Project
2. Connect your GitHub repository
3. Railway detects `railway.json` automatically

### Step 2: Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**
2. Railway creates a managed PostgreSQL instance
3. In your app service, go to **Variables** → add a reference to `${{Postgres.DATABASE_URL}}`

### Step 3: Set environment variables

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | Auto-set by Railway PostgreSQL | ✅ |
| `NODE_ENV` | `production` | ✅ |
| `PORT` | Auto-set by Railway | ✅ (auto) |
| `CLIENT_URL` | Your Railway app URL | Optional |
| `DEVELOPMENT_MODE` | `true` | ⚠️ Dev only |

### Step 4: Deploy

Railway automatically runs:
```bash
npm install
npm run build
npm start
```

### Step 5: Seed production database

After deploy, open a Railway shell or run locally with production `DATABASE_URL`:
```bash
DATABASE_URL="your-railway-db-url" npm run seed
```

### Health Check

Railway checks `GET /health` → must return `{ "status": "ok" }` ✅

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://citydb:citydb@localhost:5432/citydb` | PostgreSQL connection string |
| `NODE_ENV` | `development` | `production` enables SSL, strict CORS |
| `PORT` | `4000` | HTTP server port (Railway sets automatically) |
| `CLIENT_URL` | `*` | Allowed CORS origin in production |
| `DEVELOPMENT_MODE` | `false` | Allow DDL/DML queries in visualizer |
| `STATEMENT_TIMEOUT_MS` | `30000` | Max query execution time |
| `VITE_WS_URL` | Auto-derived | Override WebSocket URL (optional) |

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check → `{ "status": "ok" }` |
| `GET` | `/api/city` | City snapshot (districts, rows, indexes, FKs) |
| `GET` | `/api/schema` | Schema info (tables, columns, indexes) |
| `GET` | `/api/metadata` | Server + PostgreSQL version info |
| `POST` | `/api/query` | Run EXPLAIN ANALYZE on SQL → Visualization IR timeline |
| `POST` | `/api/query/explain-only` | Run EXPLAIN (no execution) → IR timeline with cost estimates |
| `POST` | `/api/compare` | Compare two queries → `{ baseline, current }` timelines |
| `WS` | `/ws` | WebSocket (same-origin, auto-detected) |

### WebSocket Messages

**Client → Server:**
```json
{ "type": "run_query", "payload": { "sql": "SELECT ..." } }
{ "type": "explain_query", "payload": { "sql": "SELECT ..." } }
{ "type": "get_city" }
{ "type": "cancel_query" }
```

**Server → Client:**
```json
{ "type": "city_snapshot", "payload": { "districts": [...] } }
{ "type": "query_timeline", "payload": { "operations": [...], "explainOnly": false } }
{ "type": "error", "payload": { "message": "..." } }
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute query |
| `Space` | Pause / Resume animation |
| `← →` | Step timeline ±200ms |
| `R` | Replay from beginning |
| `F` | Toggle fullscreen |
| `Esc` | Cancel in-flight query |

---

## Security

- **SELECT-only** in production (set `DEVELOPMENT_MODE=true` to allow DDL/DML)
- **Explain-only mode** (`/api/query/explain-only`) is always safe — never executes the query
- **Read-only transactions** — `BEGIN READ ONLY` wraps every `EXPLAIN ANALYZE`
- **Single statement** — embedded semicolons and comment injection blocked
- **Parameterized queries** only — no string concatenation
- **Rate limiting** — 120 requests/minute per IP on `/api`
- **Helmet** security headers on all responses
- **CORS** restricted to `CLIENT_URL` in production
- **No stack traces** exposed in API error responses
- **Source maps hidden** in production builds (not referenced in bundle)

---

## Troubleshooting

### `Connection refused` / Can't connect to PostgreSQL
- Ensure `docker-compose up -d postgres` is running
- Check `DATABASE_URL` in your `.env` matches docker-compose credentials

### Frontend shows "disconnected" permanently
- The frontend derives WebSocket URL from `window.location` automatically
- In dev mode with `npm run dev:backend` + `npm run dev`, the Vite proxy forwards `/ws` to backend
- Check backend is running on port 4000

### Railway deployment: DB connection fails at startup
- Verify `DATABASE_URL` is linked to your Railway PostgreSQL service
- Check Railway's deployment logs for SSL/cert errors
- SSL is auto-detected for Railway URLs; no manual config needed

### Queries fail with "Only SELECT queries are allowed"
- Production enforces SELECT-only
- Set `DEVELOPMENT_MODE=true` in Railway variables to allow DDL/DML (dev/staging only)

### Large three.js bundle warning
- Expected — Three.js is ~700KB minified. The bundle is split and cached by the browser.
- Use HTTP/2 push or a CDN for production performance optimization.

---

## Known Limitations

1. **No persistent query history on server** — history is localStorage only (browser-specific)
2. **No auth** — CityDB is a development/educational tool, not designed for public internet exposure without a reverse proxy with auth
3. **EXPLAIN ANALYZE executes the query** — for large tables with slow queries, this may time out (configurable via `STATEMENT_TIMEOUT_MS`). Use **Explain** mode for safe cost estimation on any query.
4. **Parallel queries** — `Gather` / `Gather Merge` nodes are visualized as aggregate ops (correct semantic, simplified visual)
5. **No query editor syntax highlighting** — uses plain `<textarea>` (CodeMirror integration is a roadmap item)

---

## Roadmap

- [ ] CodeMirror SQL editor with syntax highlighting and autocomplete
- [ ] Persistent server-side query history
- [ ] User authentication (basic auth or OAuth)
- [ ] Multi-schema support
- [ ] Query plan diffing (structural diff, not just timing diff)
- [ ] Export plan as PNG / JSON
- [ ] Custom city themes

---

## Development

### Running tests
```bash
npm run test               # Run all backend tests (37 tests)
npm run test:watch         # Watch mode
```

### Building
```bash
npm run build              # Build backend + frontend
npm run build:backend      # Backend only (TypeScript compile)
npm run build:frontend     # Frontend only (Vite)
```

### Full-stack with Docker
```bash
docker-compose up          # PostgreSQL + backend (frontend on Vite dev server separately)
```
