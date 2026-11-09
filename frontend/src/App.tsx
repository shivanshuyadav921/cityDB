import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CityScene } from "./CityScene";
import { ExecutionHUD } from "./ExecutionHUD";
import { PlanTree } from "./PlanTree";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { useCityDB } from "./useCityDB";
import { ErrorBoundary } from "./ErrorBoundary";
import { ToastContainer, useToast } from "./Toast";
import { useAuth } from "./AuthContext";
import { AuthModal } from "./AuthModal";
import { SchemaModal } from "./SchemaModal";
import type { VisualTimeline } from "./ir";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  sql: string;
  timeline: VisualTimeline;
  ranAt: number;
  executionMs: number;
  pinned: boolean;
}

interface SavedQuery {
  id: number;
  name: string;
  sql: string;
  savedAt: number;
}

let historyIdCounter = 0;
let savedQueryIdCounter = 0;

const DEMO_QUERY = "SELECT * FROM users WHERE email = 'alice@example.com'";
const HISTORY_STORAGE_KEY = "citydb_query_history";
const SAVED_QUERIES_STORAGE_KEY = "citydb_saved_queries";

const SAMPLE_QUERIES = [
  {
    label: "Demo: Index/Seq Scan",
    sql: "SELECT * FROM users WHERE email = 'alice@example.com'",
  },
  {
    label: "Filter & High Cost Scan",
    sql: "SELECT * FROM users WHERE salary > 100000",
  },
  {
    label: "Department Aggregation",
    sql: "SELECT department, COUNT(*), AVG(salary) FROM users GROUP BY department",
  },
  {
    label: "Top 10 Earners (Sort + Limit)",
    sql: "SELECT name, salary, department FROM users ORDER BY salary DESC LIMIT 10",
  },
  {
    label: "Total Count",
    sql: "SELECT count(*) FROM users",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadHistoryFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage may be unavailable
  }
}

function loadSavedQueriesFromStorage(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(SAVED_QUERIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedQuery[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedQueriesToStorage(queries: SavedQuery[]): void {
  try {
    localStorage.setItem(SAVED_QUERIES_STORAGE_KEY, JSON.stringify(queries));
  } catch {
    // ignore
  }
}

function formatSQL(sql: string): string {
  return sql
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    connected,
    transport,
    city,
    timeline,
    error,
    loading,
    runQuery,
    explainQuery,
    cancelQuery,
    refreshCity,
  } = useCityDB();

  const { user, logout } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [sql, setSql] = useState(DEMO_QUERY);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoveredOpId, setHoveredOpId] = useState<string | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistoryFromStorage);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(loadSavedQueriesFromStorage);
  const [compareMode, setCompareMode] = useState(false);
  const [compareAgainst, setCompareAgainst] = useState<VisualTimeline | null>(null);
  const [comparePlayheadMs, setComparePlayheadMs] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const rafRef = useRef<number>();
  const lastTsRef = useRef<number>();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // History persistence
  useEffect(() => {
    saveHistoryToStorage(history);
  }, [history]);

  // Saved queries persistence
  useEffect(() => {
    saveSavedQueriesToStorage(savedQueries);
  }, [savedQueries]);

  // Timeline arrival
  useEffect(() => {
    if (!timeline) return;
    setPlayheadMs(0);
    setPlaying(true);
    setSelectedOpId(null);
    if (!timeline.explainOnly) {
      const entry: HistoryEntry = {
        id: ++historyIdCounter,
        sql,
        timeline,
        ranAt: Date.now(),
        executionMs: timeline.totalExecutionTimeMs,
        pinned: false,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
      addToast(`Query executed in ${timeline.totalExecutionTimeMs.toFixed(1)}ms`, "success");
    } else {
      addToast("Cost estimates ready (EXPLAIN only — no execution)", "info");
    }
  }, [timeline, addToast]);

  // Error display
  useEffect(() => {
    if (error && !error.startsWith("Notice:")) {
      addToast(error, "error");
    }
  }, [error, addToast]);

  // Animation loop
  useEffect(() => {
    if (!playing || !timeline) return;

    function tick(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const delta = (ts - lastTsRef.current) * speed;
      lastTsRef.current = ts;

      setPlayheadMs((prev) => {
        const next = prev + delta;
        if (next >= (timeline?.totalDurationNormalizedMs ?? 0)) {
          setPlaying(false);
          return timeline?.totalDurationNormalizedMs ?? 0;
        }
        return next;
      });

      if (compareMode && compareAgainst) {
        setComparePlayheadMs((prev) => {
          const next = prev + delta;
          return Math.min(next, compareAgainst.totalDurationNormalizedMs);
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = undefined;
    };
  }, [playing, speed, timeline, compareMode, compareAgainst]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "TEXTAREA" || target.tagName === "INPUT";

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
        return;
      }
      if (e.key === "Escape" && loading) {
        cancelQuery();
        addToast("Query cancelled.", "info");
        return;
      }
      if (isTyping) return;

      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight" && timeline) {
        setPlaying(false);
        setPlayheadMs((p) => Math.min(p + 200, timeline.totalDurationNormalizedMs));
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setPlayheadMs((p) => Math.max(p - 200, 0));
      } else if (e.key === "r" || e.key === "R") {
        setPlayheadMs(0);
        setPlaying(true);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, timeline, cancelQuery]);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((f) => !f);
  }, []);

  function handleRun() {
    if (!sql.trim()) return;
    runQuery(sql);
  }

  function handleExplain() {
    if (!sql.trim()) return;
    explainQuery(sql);
  }

  function handleFormatSQL() {
    setSql(formatSQL(sql));
    addToast("SQL formatted.", "info");
  }

  function handlePlayOp(opId: string) {
    if (!timeline) return;
    const op = timeline.operations.find((o) => o.id === opId);
    if (op) {
      setSelectedOpId(opId);
      setPlayheadMs(op.startTime);
      setPlaying(true);
    }
  }

  function handleCopySQL() {
    void navigator.clipboard.writeText(sql).then(() => {
      addToast("SQL copied to clipboard.", "success");
    });
  }

  function handleHistoryReload(entry: HistoryEntry) {
    setSql(entry.sql);
    textareaRef.current?.focus();
  }

  function handleHistoryDelete(id: number) {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }

  function handleHistoryPin(id: number) {
    setHistory((prev) =>
      prev.map((h) => (h.id === id ? { ...h, pinned: !h.pinned } : h))
    );
  }

  function handleSaveQuery() {
    const name = saveQueryName.trim() || `Query ${savedQueryIdCounter + 1}`;
    const entry: SavedQuery = {
      id: ++savedQueryIdCounter,
      name,
      sql: sql.trim(),
      savedAt: Date.now(),
    };
    setSavedQueries((prev) => [entry, ...prev].slice(0, 50));
    setSaveQueryName("");
    addToast(`Saved as "${name}".`, "success");
  }

  function handleDeleteSavedQuery(id: number) {
    setSavedQueries((prev) => prev.filter((q) => q.id !== id));
  }

  function pickAsCompareBaseline(entry: HistoryEntry) {
    setCompareAgainst(entry.timeline);
    setCompareMode(true);
    setComparePlayheadMs(0);
    addToast(`Baseline set: "${entry.sql.slice(0, 40)}…"`, "info");
  }

  function handleRefreshCity() {
    refreshCity();
    addToast("Refreshing city snapshot from database…", "info");
  }

  const sortedHistory = [...history].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.ranAt - a.ranAt;
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        background: "#05070d",
        overflow: "hidden",
      }}
    >
      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      {!fullscreen && (
        <header
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 52,
            background: "rgba(8, 12, 24, 0.92)",
            borderBottom: "1px solid #1a2340",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            zIndex: 30,
          }}
        >
          {/* Left Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: "linear-gradient(135deg, #ffe14d 0%, #ff8c00 100%)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 12px rgba(255, 225, 77, 0.4)",
                  fontWeight: 900,
                  fontSize: 13,
                  color: "#05070d",
                }}
              >
                C
              </div>
              <h1
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#e8ecff",
                  margin: 0,
                  letterSpacing: "0.02em",
                }}
              >
                City<span style={{ color: "#ffe14d" }}>DB</span>
              </h1>
              <span
                style={{
                  fontSize: 10,
                  background: "#111a30",
                  color: "#8fb0ff",
                  border: "1px solid #1a2340",
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontWeight: 600,
                }}
              >
                v1.0
              </span>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: connected ? "rgba(74, 255, 138, 0.1)" : "rgba(255, 90, 110, 0.1)",
                border: `1px solid ${connected ? "rgba(74, 255, 138, 0.25)" : "rgba(255, 90, 110, 0.25)"}`,
                borderRadius: 20,
                padding: "2px 8px",
                fontSize: 10,
                color: connected ? "#4aff8a" : "#ff5a6e",
                fontWeight: 600,
              }}
            >
              <span>{connected ? "●" : "○"}</span>
              <span>{connected ? (transport === "websocket" ? "WS Live" : "REST Live") : "Offline"}</span>
            </div>
          </div>

          {/* Center Sample Query Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#5a6a8f" }}>Sample:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  setSql(e.target.value);
                  textareaRef.current?.focus();
                }
              }}
              defaultValue=""
              style={{
                background: "#080c18",
                border: "1px solid #1a2340",
                color: "#8fa0cc",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="" disabled>
                Load preset query…
              </option>
              {SAMPLE_QUERIES.map((q) => (
                <option key={q.label} value={q.sql}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>

          {/* Right Navigation Controls & User Profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setSchemaModalOpen(true)}
              style={{
                background: "#111a30",
                border: "1px solid #1a2340",
                borderRadius: 6,
                color: "#8fa0cc",
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
              title="Inspect tables, columns, indexes and foreign keys"
            >
              <span>📊</span> Schema Explorer
            </button>

            <IconButton
              title="Refresh city snapshot from database"
              onClick={handleRefreshCity}
            >
              ↻
            </IconButton>

            <IconButton
              title="Settings"
              onClick={() => setShowSettings((s) => !s)}
              active={showSettings}
            >
              ⚙
            </IconButton>

            {/* Auth Profile / Sign-in */}
            {user ? (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setUserDropdownOpen((o) => !o)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#111a30",
                    border: "1px solid #2a3a60",
                    borderRadius: 20,
                    padding: "3px 10px 3px 4px",
                    color: "#e8ecff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: user.avatar_url
                        ? `url(${user.avatar_url}) center/cover`
                        : "linear-gradient(135deg, #4d7cff, #9b51e0)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {!user.avatar_url && user.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.name}
                  </span>
                  <span style={{ fontSize: 9, color: "#5a6a8f" }}>▼</span>
                </button>

                {userDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 36,
                      right: 0,
                      width: 220,
                      background: "#080c18",
                      border: "1px solid #1a2340",
                      borderRadius: 8,
                      padding: 12,
                      boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                      zIndex: 100,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#e8ecff" }}>
                      {user.name}
                    </div>
                    <div style={{ fontSize: 10, color: "#5a6a8f", marginTop: 2, wordBreak: "break-all" }}>
                      {user.email}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        display: "inline-block",
                        fontSize: 9,
                        background: user.provider === "google" ? "rgba(66, 133, 244, 0.15)" : "#111a30",
                        color: user.provider === "google" ? "#82b1ff" : "#ffe14d",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontWeight: 600,
                      }}
                    >
                      Signed in via {user.provider === "google" ? "Google" : "Email"}
                    </div>

                    <div style={{ height: 1, background: "#111a30", margin: "10px 0" }} />

                    <button
                      onClick={() => {
                        logout();
                        setUserDropdownOpen(false);
                        addToast("Signed out successfully.", "info");
                      }}
                      style={{
                        width: "100%",
                        background: "#22080e",
                        border: "1px solid #55121e",
                        color: "#ff5a6e",
                        borderRadius: 6,
                        padding: "6px 0",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                style={{
                  background: "linear-gradient(135deg, #1a2340, #2a3a60)",
                  border: "1px solid #ffe14d66",
                  color: "#ffe14d",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  boxShadow: "0 0 10px rgba(255, 225, 77, 0.15)",
                }}
              >
                Sign In / Register
              </button>
            )}
          </div>
        </header>
      )}

      {/* ── 3D Canvas ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
        }}
      >
        <div
          ref={canvasContainerRef}
          style={{
            position: "relative",
            flex: 1,
            borderRight: compareMode ? "2px solid #ffe14d44" : "none",
          }}
        >
          {compareMode && <SplitLabel text="AFTER (current)" />}
          <ErrorBoundary>
            <Canvas
              camera={{ position: [22, 18, 22], fov: 45 }}
              shadows
              style={{ background: "#05070d" }}
            >
              <color attach="background" args={["#05070d"]} />
              <CityScene
                timeline={timeline}
                playheadMs={playheadMs}
                city={city}
                hoveredOpId={hoveredOpId}
              />
              <OrbitControls maxPolarAngle={Math.PI / 2.1} />
            </Canvas>
          </ErrorBoundary>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            title="Toggle fullscreen (F)"
            style={{
              position: "absolute",
              top: fullscreen ? 12 : 64,
              right: 12,
              background: "rgba(8,12,24,0.8)",
              border: "1px solid #1a2340",
              borderRadius: 6,
              color: "#5a6a8f",
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 5,
            }}
          >
            {fullscreen ? "⤡" : "⤢"}
          </button>
        </div>

        {compareMode && compareAgainst && (
          <div style={{ position: "relative", flex: 1 }}>
            <SplitLabel text="BEFORE (baseline)" dim />
            <ErrorBoundary>
              <Canvas
                camera={{ position: [22, 18, 22], fov: 45 }}
                shadows
                style={{ background: "#05070d" }}
              >
                <color attach="background" args={["#05070d"]} />
                <CityScene
                  timeline={compareAgainst}
                  playheadMs={comparePlayheadMs}
                  city={city}
                  hoveredOpId={null}
                />
                <OrbitControls maxPolarAngle={Math.PI / 2.1} />
              </Canvas>
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* ── Left panel: SQL editor + controls ─────────────────────────────── */}
      {!fullscreen && (
        <div style={topLeftPanel}>
          {/* Settings panel */}
          {showSettings && (
            <div
              style={{
                background: "#0a0e1a",
                border: "1px solid #1a2340",
                borderRadius: 6,
                padding: 10,
                marginBottom: 10,
                fontSize: 11,
                color: "#5a6a8f",
              }}
            >
              <div style={{ marginBottom: 6, color: "#8fb0ff", fontWeight: 600 }}>
                Settings & Shortcuts
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={compareMode}
                  onChange={(e) => {
                    setCompareMode(e.target.checked);
                    if (!e.target.checked) {
                      setCompareAgainst(null);
                      setComparePlayheadMs(0);
                    }
                  }}
                />
                Compare mode (split screen)
              </label>
              <div style={{ marginTop: 8, color: "#3d4a70", fontSize: 10 }}>
                <kbd style={kbdStyle}>Ctrl+↵</kbd> Execute query
                <br />
                <kbd style={kbdStyle}>Space</kbd> Pause / Resume
                <br />
                <kbd style={kbdStyle}>← →</kbd> Step timeline
                <br />
                <kbd style={kbdStyle}>R</kbd> Replay
                <br />
                <kbd style={kbdStyle}>F</kbd> Fullscreen
                <br />
                <kbd style={kbdStyle}>Esc</kbd> Cancel query
              </div>
            </div>
          )}

          {/* SQL editor */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "#5a6a8f", fontWeight: 600 }}>
              SQL Query Editor
            </span>
            <span style={{ fontSize: 9, color: "#3d4a70" }}>
              PostgreSQL EXPLAIN ANALYZE
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="sql-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                handleRun();
              }
            }}
            rows={4}
            spellCheck={false}
            placeholder="SELECT ..."
            style={textareaStyle}
            aria-label="SQL query editor"
          />

          {/* Editor actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button
              id="run-query-btn"
              style={btnStyle}
              onClick={handleRun}
              disabled={loading || !connected}
              title="Execute query and animate plan in 3D (Ctrl+Enter)"
            >
              {loading ? "⏳ Running…" : "▶ Execute"}
            </button>
            <button
              id="explain-query-btn"
              style={{
                ...btnStyle,
                flex: "0 1 auto",
                background: "#1a2340",
                color: "#8fb0ff",
                border: "1px solid #2a3a60",
                padding: "9px 10px",
              }}
              onClick={handleExplain}
              disabled={loading || !connected}
              title="Show cost estimates without executing (EXPLAIN only)"
            >
              📋 Explain
            </button>
            <button
              style={{ ...smallBtnStyle, padding: "8px 10px" }}
              onClick={() => setSql("")}
              disabled={loading}
              title="Clear editor"
            >
              ✕
            </button>
            <button
              style={{ ...smallBtnStyle, padding: "8px 10px" }}
              onClick={handleCopySQL}
              title="Copy SQL"
            >
              ⧉
            </button>
            <button
              style={{ ...smallBtnStyle, padding: "8px 10px" }}
              onClick={handleFormatSQL}
              title="Format SQL (normalize whitespace)"
            >
              ⌫
            </button>
            {loading && (
              <button
                style={{
                  ...smallBtnStyle,
                  padding: "8px 10px",
                  background: "#3a0a14",
                  color: "#ff5a6e",
                  border: "1px solid #7a1a2a",
                }}
                onClick={() => {
                  cancelQuery();
                  addToast("Query cancelled.", "info");
                }}
                title="Cancel query (Esc)"
              >
                ✕ Cancel
              </button>
            )}
          </div>

          {/* Timeline controls */}
          {timeline && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  color: "#3d4a70",
                  marginBottom: 4,
                }}
              >
                <span>{Math.round(playheadMs)}ms</span>
                <span>/{Math.round(timeline.totalDurationNormalizedMs)}ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={timeline.totalDurationNormalizedMs}
                value={playheadMs}
                onChange={(e) => {
                  setPlaying(false);
                  setPlayheadMs(Number(e.target.value));
                }}
                style={{ width: "100%", accentColor: "#ffe14d" }}
                aria-label="Timeline scrubber"
              />
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  marginTop: 6,
                  alignItems: "center",
                }}
              >
                <button
                  style={smallBtnStyle}
                  onClick={() => {
                    setPlayheadMs(0);
                    setPlaying(true);
                  }}
                  title="Replay (R)"
                >
                  ⟳
                </button>
                <button
                  style={smallBtnStyle}
                  onClick={() => setPlaying((p) => !p)}
                  title="Pause / Resume (Space)"
                >
                  {playing ? "⏸" : "▶"}
                </button>
                <span style={{ fontSize: 10, color: "#3d4a70", marginLeft: 2 }}>
                  Speed:
                </span>
                {([0.25, 0.5, 1, 2, 4] as const).map((s) => (
                  <button
                    key={s}
                    style={{
                      ...smallBtnStyle,
                      background: speed === s ? "#ffe14d" : "#1a2340",
                      color: speed === s ? "#05070d" : "#e8ecff",
                      padding: "3px 6px",
                      fontSize: 10,
                    }}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Compare mode notice */}
          {compareMode && !compareAgainst && (
            <div
              style={{
                fontSize: 10,
                color: "#ffe14d",
                background: "#1a1500",
                border: "1px solid #4a3a00",
                borderRadius: 4,
                padding: "6px 8px",
                marginTop: 8,
              }}
            >
              Pin a query from History as the baseline to compare against.
            </div>
          )}

          {/* Query history */}
          {sortedHistory.length > 0 && (
            <div
              style={{
                marginTop: 14,
                borderTop: "1px solid #111a30",
                paddingTop: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#5a6a8f",
                  marginBottom: 6,
                  fontWeight: 600,
                }}
              >
                Query History ({sortedHistory.length})
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {sortedHistory.map((h) => (
                  <HistoryItem
                    key={h.id}
                    entry={h}
                    compareMode={compareMode}
                    onReload={handleHistoryReload}
                    onDelete={handleHistoryDelete}
                    onPin={handleHistoryPin}
                    onBaseline={pickAsCompareBaseline}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Saved queries panel */}
          <div
            style={{
              marginTop: 12,
              borderTop: "1px solid #111a30",
              paddingTop: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 10, color: "#5a6a8f", fontWeight: 600 }}>
                Saved Queries{savedQueries.length > 0 ? ` (${savedQueries.length})` : ""}
              </div>
              <IconButton
                title={showSavedQueries ? "Hide saved queries" : "Show saved queries"}
                onClick={() => setShowSavedQueries((s) => !s)}
                size={20}
                active={showSavedQueries}
              >
                {showSavedQueries ? "▲" : "▼"}
              </IconButton>
            </div>

            {/* Save current query form */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <input
                type="text"
                placeholder="Name (optional)"
                value={saveQueryName}
                onChange={(e) => setSaveQueryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveQuery();
                }}
                style={{
                  flex: 1,
                  background: "#080c18",
                  border: "1px solid #1a2340",
                  borderRadius: 4,
                  color: "#e8ecff",
                  fontSize: 10,
                  padding: "4px 6px",
                  outline: "none",
                }}
              />
              <button
                style={{ ...smallBtnStyle, fontSize: 10, padding: "4px 8px" }}
                onClick={handleSaveQuery}
                disabled={!sql.trim()}
                title="Save current query"
              >
                💾 Save
              </button>
            </div>

            {showSavedQueries && savedQueries.length > 0 && (
              <div style={{ maxHeight: 140, overflowY: "auto" }}>
                {savedQueries.map((q) => (
                  <div
                    key={q.id}
                    style={{
                      padding: "4px 0",
                      borderBottom: "1px solid #0d1428",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "#8fa0cc",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setSql(q.sql);
                        textareaRef.current?.focus();
                      }}
                      title={q.sql}
                    >
                      📎 {q.name}
                    </span>
                    <IconButton
                      title="Delete saved query"
                      onClick={() => handleDeleteSavedQuery(q.id)}
                      size={18}
                    >
                      ✕
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
            {showSavedQueries && savedQueries.length === 0 && (
              <div style={{ fontSize: 9, color: "#3d4a70" }}>
                No saved queries yet. Enter a query above and click 💾 Save.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Right panels ─────────────────────────────────────────────────── */}
      {!fullscreen && (
        <>
          <ExecutionHUD timeline={timeline} playheadMs={playheadMs} />
          <PlanTree
            timeline={timeline}
            hoveredOpId={hoveredOpId}
            onHoverOp={setHoveredOpId}
            onPlayOp={handlePlayOp}
            selectedOpId={selectedOpId}
          />
          <PerformanceDashboard timeline={timeline} />
        </>
      )}

      {/* ── Compare delta badge ───────────────────────────────────────────── */}
      {compareMode && timeline && compareAgainst && (
        <CompareDeltaBadge current={timeline} baseline={compareAgainst} />
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(msg) => addToast(msg, "success")}
      />

      <SchemaModal
        isOpen={schemaModalOpen}
        onClose={() => setSchemaModalOpen(false)}
        city={city}
        onSelectQuery={(newSql) => {
          setSql(newSql);
          textareaRef.current?.focus();
        }}
      />

      {/* ── Toast notifications ───────────────────────────────────────────── */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SplitLabel({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 11,
        color: dim ? "#5a6a8f" : "#ffe14d",
        background: "rgba(8,12,24,0.85)",
        padding: "4px 12px",
        borderRadius: 4,
        zIndex: 5,
        border: `1px solid ${dim ? "#1a2340" : "#ffe14d44"}`,
        letterSpacing: "0.08em",
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
}

function CompareDeltaBadge({
  current,
  baseline,
}: {
  current: VisualTimeline;
  baseline: VisualTimeline;
}) {
  const delta = current.totalExecutionTimeMs - baseline.totalExecutionTimeMs;
  const pct =
    baseline.totalExecutionTimeMs > 0
      ? ((delta / baseline.totalExecutionTimeMs) * 100).toFixed(1)
      : "N/A";
  const faster = delta < 0;
  const color = faster ? "#4aff8a" : delta > 0 ? "#ff5a6e" : "#e8ecff";

  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(8,12,24,0.9)",
        border: `1px solid ${color}44`,
        borderRadius: 8,
        padding: "8px 16px",
        color,
        fontSize: 13,
        fontWeight: 700,
        zIndex: 10,
        textAlign: "center",
      }}
    >
      {faster ? "▼" : "▲"} {Math.abs(delta).toFixed(2)}ms ({faster ? "-" : "+"}
      {Math.abs(Number(pct))}%)
      <div style={{ fontSize: 9, color: "#5a6a8f", fontWeight: 400 }}>
        vs baseline
      </div>
    </div>
  );
}

function HistoryItem({
  entry,
  compareMode,
  onReload,
  onDelete,
  onPin,
  onBaseline,
}: {
  entry: HistoryEntry;
  compareMode: boolean;
  onReload: (e: HistoryEntry) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onBaseline: (e: HistoryEntry) => void;
}) {
  return (
    <div
      style={{
        padding: "5px 0",
        borderBottom: "1px solid #0d1428",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: entry.pinned ? "#ffe14d" : "#8fa0cc",
            cursor: "pointer",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          onClick={() => onReload(entry)}
          title={entry.sql}
        >
          {entry.pinned ? "📌 " : ""}
          {entry.sql}
        </span>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          <IconButton
            title={entry.pinned ? "Unpin" : "Pin"}
            onClick={() => onPin(entry.id)}
            size={18}
          >
            {entry.pinned ? "★" : "☆"}
          </IconButton>
          {compareMode && (
            <IconButton
              title="Set as baseline"
              onClick={() => onBaseline(entry)}
              size={18}
            >
              ⇐
            </IconButton>
          )}
          <IconButton
            title="Delete from history"
            onClick={() => onDelete(entry.id)}
            size={18}
          >
            ✕
          </IconButton>
        </div>
      </div>
      <div style={{ fontSize: 9, color: "#3d4a70" }}>
        {entry.executionMs.toFixed(2)}ms ·{" "}
        {new Date(entry.ranAt).toLocaleTimeString()}
      </div>
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  active,
  size = 28,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? "#1a2a50" : "transparent",
        border: active ? "1px solid #4d7cff" : "1px solid transparent",
        borderRadius: 4,
        color: active ? "#8fb0ff" : "#5a6a8f",
        width: size,
        height: size,
        cursor: "pointer",
        fontSize: size * 0.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "color 0.15s, background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const topLeftPanel: React.CSSProperties = {
  position: "absolute",
  top: 64,
  left: 16,
  width: 320,
  background: "rgba(8,12,24,0.92)",
  border: "1px solid #1a2340",
  borderRadius: 10,
  padding: 14,
  color: "#e8ecff",
  backdropFilter: "blur(8px)",
  maxHeight: "calc(100vh - 80px)",
  overflowY: "auto",
  zIndex: 10,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#080c18",
  border: "1px solid #1a2340",
  borderRadius: 6,
  color: "#8fe0a0",
  fontFamily: "'Courier New', 'Consolas', monospace",
  padding: "8px 10px",
  fontSize: 12,
  resize: "vertical",
  outline: "none",
  lineHeight: 1.5,
};

const btnStyle: React.CSSProperties = {
  flex: 1,
  background: "#ffe14d",
  color: "#05070d",
  border: "none",
  borderRadius: 6,
  padding: "9px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.02em",
};

const smallBtnStyle: React.CSSProperties = {
  background: "#111a30",
  color: "#e8ecff",
  border: "1px solid #1a2340",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
  cursor: "pointer",
};

const kbdStyle: React.CSSProperties = {
  background: "#111a30",
  border: "1px solid #1a2340",
  borderRadius: 3,
  padding: "1px 4px",
  fontSize: 9,
  fontFamily: "monospace",
  color: "#8fb0ff",
  marginRight: 4,
};
