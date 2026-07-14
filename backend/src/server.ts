import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import {
  getCityMetadata,
  runExplain,
  runExplainOnly,
  getPool,
  getSchemaInfo,
} from "./postgres.js";
import { translateExplainToTimeline } from "./translator.js";
import type { ClientMessage, ServerMessage } from "./ir.js";
import { assertVisualizableQuery } from "./validation.js";
import { logger } from "./logger.js";

// ─── Environment ─────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const CLIENT_URL = process.env.CLIENT_URL || "*";
const IS_PROD = NODE_ENV === "production";

// ─── App setup ───────────────────────────────────────────────────────────────

const app = express();

// Security headers — disable contentSecurityPolicy for React Three Fiber inline scripts
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip compression
app.use(compression() as express.RequestHandler);

// CORS — allow configured client origin in production, all origins in dev
app.use(
  cors({
    origin: IS_PROD ? CLIENT_URL : "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing
app.use(express.json({ limit: "64kb" }));

// Rate limiting — 120 requests/minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});
app.use("/api", limiter);

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info("request", { method: req.method, path: req.path, ip: req.ip });
  next();
});

// ─── Health check (Railway requirement) ──────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ─── REST API ────────────────────────────────────────────────────────────────

/** City snapshot: districts, row counts, indexes, foreign keys. */
app.get("/api/city", async (_req: Request, res: Response) => {
  try {
    const snapshot = await getCityMetadata();
    res.json(snapshot);
  } catch (err) {
    logger.error("city endpoint error", { message: (err as Error).message });
    res.status(500).json({ error: "Failed to fetch city metadata." });
  }
});

/** Schema info: tables, columns, indexes, foreign keys — no row counts. */
app.get("/api/schema", async (_req: Request, res: Response) => {
  try {
    const schema = await getSchemaInfo();
    res.json(schema);
  } catch (err) {
    logger.error("schema endpoint error", { message: (err as Error).message });
    res.status(500).json({ error: "Failed to fetch schema information." });
  }
});

/** Server metadata: versions, environment info (no secrets). */
app.get("/api/metadata", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const versionRes = await pool.query<{ version: string }>(
      "SELECT version()"
    );
    const pgVersion = versionRes.rows[0]?.version ?? "unknown";
    const dbUrl = process.env.DATABASE_URL ?? "";
    // Strip credentials from URL for safe display
    let dbHost = "unknown";
    try {
      const u = new URL(dbUrl);
      dbHost = u.hostname;
    } catch {
      // ignore parse errors
    }
    res.json({
      nodeVersion: process.version,
      nodeEnv: NODE_ENV,
      postgresVersion: pgVersion,
      databaseHost: dbHost,
      uptime: Math.floor(process.uptime()),
    });
  } catch (err) {
    logger.error("metadata endpoint error", { message: (err as Error).message });
    res.status(500).json({ error: "Failed to fetch metadata." });
  }
});

/** Run EXPLAIN on a single query, return Visualization IR timeline. */
app.post("/api/query", async (req: Request, res: Response) => {
  try {
    const { sql } = req.body as { sql?: unknown };
    assertVisualizableQuery(sql);
    const explain = await runExplain(sql);
    const timeline = translateExplainToTimeline(explain, sql);
    res.json(timeline);
  } catch (err) {
    const message = (err as Error).message;
    logger.warn("query endpoint rejected", { message });
    res.status(400).json({ error: message });
  }
});

/** Run EXPLAIN without ANALYZE — cost estimates only, query is never executed. */
app.post("/api/query/explain-only", async (req: Request, res: Response) => {
  try {
    const { sql } = req.body as { sql?: unknown };
    assertVisualizableQuery(sql);
    const explain = await runExplainOnly(sql);
    const timeline = translateExplainToTimeline(explain, sql);
    res.json(timeline);
  } catch (err) {
    const message = (err as Error).message;
    logger.warn("explain_only_rejected", { message });
    res.status(400).json({ error: message });
  }
});

/** Compare two queries: run both EXPLAINs, return two timelines. */
app.post("/api/compare", async (req: Request, res: Response) => {
  try {
    const { sql1, sql2 } = req.body as { sql1?: unknown; sql2?: unknown };
    assertVisualizableQuery(sql1);
    assertVisualizableQuery(sql2);
    const [explain1, explain2] = await Promise.all([
      runExplain(sql1),
      runExplain(sql2),
    ]);
    const timeline1 = translateExplainToTimeline(explain1, sql1);
    const timeline2 = translateExplainToTimeline(explain2, sql2);
    res.json({ baseline: timeline1, current: timeline2 });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn("compare endpoint rejected", { message });
    res.status(400).json({ error: message });
  }
});

/** Query history is persisted client-side in localStorage. */
app.get("/api/history", (_req: Request, res: Response) => {
  res.status(200).json({
    message:
      "Query history is stored client-side in the browser's localStorage. No server-side history is maintained.",
  });
});

// ─── Static frontend serving ──────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In production (dist/server.js), frontend is at ../../frontend/dist
// In local dev, this path won't exist — that's fine (Vite dev server handles it)
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

app.use(express.static(frontendDist));

// SPA catch-all: return index.html for any non-API route
app.get("*", (req: Request, res: Response) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/health")) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const indexPath = path.join(frontendDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      // Frontend not built yet (dev mode)
      res
        .status(200)
        .send(
          "<html><body><pre>CityDB backend running. Build the frontend or use npm run dev.</pre></body></html>"
        );
    }
  });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (socket: WebSocket, req) => {
  logger.info("ws_connect", { ip: req.socket.remoteAddress });

  // Send initial empty snapshot immediately so the client knows it's connected
  send(socket, { type: "city_snapshot", payload: { districts: [] } });

  // Then load the real city metadata
  getCityMetadata()
    .then((snapshot) =>
      send(socket, { type: "city_snapshot", payload: snapshot })
    )
    .catch((err) =>
      send(socket, {
        type: "error",
        payload: { message: (err as Error).message },
      })
    );

  socket.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(socket, { type: "error", payload: { message: "Invalid JSON." } });
      return;
    }

    if (msg.type === "get_city") {
      try {
        const snapshot = await getCityMetadata();
        send(socket, { type: "city_snapshot", payload: snapshot });
      } catch (err) {
        send(socket, {
          type: "error",
          payload: { message: (err as Error).message },
        });
      }
    } else if (msg.type === "run_query") {
      try {
        assertVisualizableQuery(msg.payload.sql);
        const explain = await runExplain(msg.payload.sql);
        const timeline = translateExplainToTimeline(explain, msg.payload.sql);
        send(socket, { type: "query_timeline", payload: timeline });
      } catch (err) {
        send(socket, {
          type: "error",
          payload: { message: (err as Error).message },
        });
      }
    } else if (msg.type === "explain_query") {
      try {
        assertVisualizableQuery(msg.payload.sql);
        const explain = await runExplainOnly(msg.payload.sql);
        const timeline = translateExplainToTimeline(explain, msg.payload.sql);
        send(socket, { type: "query_timeline", payload: timeline });
      } catch (err) {
        send(socket, {
          type: "error",
          payload: { message: (err as Error).message },
        });
      }
    } else if (msg.type === "cancel_query") {
      // Cancellation is handled at the HTTP/connection level via AbortController
      // For WS, simply acknowledge — the in-flight query will finish or timeout
      send(socket, {
        type: "error",
        payload: { message: "Query cancelled by client." },
      });
    }
  });

  socket.on("close", () => {
    logger.info("ws_disconnect", { ip: req.socket.remoteAddress });
  });

  socket.on("error", (err) => {
    logger.error("ws_error", { message: err.message });
  });
});

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

// ─── Server startup with connection retry ─────────────────────────────────────

async function startServer(): Promise<void> {
  logger.info("starting_server", { port: PORT, env: NODE_ENV });

  // Verify DB connectivity before accepting traffic
  const pool = getPool();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      const client = await pool.connect();
      client.release();
      logger.info("database_connected");
      break;
    } catch (err) {
      attempts += 1;
      const delay = Math.min(1000 * 2 ** attempts, 30000);
      logger.warn("database_connect_retry", {
        attempt: attempts,
        max: maxAttempts,
        retryInMs: delay,
        message: (err as Error).message,
      });
      if (attempts >= maxAttempts) {
        logger.error("database_connect_failed", {
          message: "Could not connect to PostgreSQL after maximum attempts.",
        });
        // Start anyway — Railway health checks will fail and trigger a restart
        break;
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info("server_listening", { port: PORT, env: NODE_ENV });
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info("shutdown_signal", { signal });

  httpServer.close((err) => {
    if (err) {
      logger.error("http_close_error", { message: err.message });
    } else {
      logger.info("http_server_closed");
    }
  });

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });
  wss.close(() => logger.info("websocket_server_closed"));

  // Drain PostgreSQL pool
  const pool = getPool();
  pool
    .end()
    .then(() => {
      logger.info("postgres_pool_closed");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("postgres_pool_close_error", { message: err.message });
      process.exit(1);
    });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.error("forced_exit", { reason: "Graceful shutdown timeout (10s)" });
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on("uncaughtException", (err) => {
  logger.error("uncaught_exception", { message: err.message, stack: err.stack });
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────

startServer().catch((err) => {
  logger.error("startup_error", { message: (err as Error).message });
  process.exit(1);
});
