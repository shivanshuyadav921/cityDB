import { useCallback, useEffect, useRef, useState } from "react";
import type { CitySnapshot, ServerMessage, VisualTimeline } from "./ir";

function deriveWsUrl(): string | null {
  if (typeof window === "undefined") return null;
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string;
  }
  // On Vercel deployments, WebSockets to /ws are not supported
  if (window.location.hostname.endsWith(".vercel.app")) {
    return null;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function getAuthHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem("citydb_auth_token");
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // localStorage unavailable
  }
  return {};
}

export interface CityDBState {
  connected: boolean;
  transport: "websocket" | "http";
  city: CitySnapshot | null;
  timeline: VisualTimeline | null;
  error: string | null;
  loading: boolean;
  runQuery: (sql: string) => void;
  explainQuery: (sql: string) => void;
  cancelQuery: () => void;
  refreshCity: () => void;
  clearError: () => void;
}

export function useCityDB(): CityDBState {
  const wsRef = useRef<WebSocket | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef(false);

  const [connected, setConnected] = useState(true);
  const [transport, setTransport] = useState<"websocket" | "http">("http");
  const [city, setCity] = useState<CitySnapshot | null>(null);
  const [timeline, setTimeline] = useState<VisualTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── HTTP loader for City Snapshot ──────────────────────────────────────────
  const fetchCityHttp = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const resp = await fetch("/api/city", {
        headers: {
          ...getAuthHeader(),
        },
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        if (data.districts && Array.isArray(data.districts)) {
          setCity(data as CitySnapshot);
        } else {
          setCity({ districts: [] });
        }
        if (data.warning) {
          setError(data.warning);
        } else {
          setError(null);
        }
      } else {
        setCity({ districts: [] });
        if (data.error) {
          setError(`Notice: ${data.error}`);
        }
      }
      setConnected(true);
    } catch (err) {
      setCity({ districts: [] });
      setConnected(true);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // ── WebSocket connect ──────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    const wsUrl = deriveWsUrl();
    if (!wsUrl) {
      setTransport("http");
      fetchCityHttp();
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const wsTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setTransport("http");
          fetchCityHttp();
        }
      }, 2000);

      ws.onopen = () => {
        clearTimeout(wsTimeout);
        setConnected(true);
        setTransport("websocket");
        setError(null);
        ws.send(JSON.stringify({ type: "get_city" }));
      };

      ws.onclose = () => {
        clearTimeout(wsTimeout);
        setTransport("http");
      };

      ws.onerror = () => {
        clearTimeout(wsTimeout);
        setTransport("http");
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type === "city_snapshot") {
            setCity(msg.payload);
            setConnected(true);
          } else if (msg.type === "query_timeline") {
            setTimeline(msg.payload);
            setError(null);
            setLoading(false);
          } else if (msg.type === "error") {
            setError(msg.payload.message);
            setLoading(false);
          }
        } catch {
          setError("Failed to parse server response.");
          setLoading(false);
        }
      };
    } catch {
      setTransport("http");
      fetchCityHttp();
    }
  }, [fetchCityHttp]);

  // Initial load
  useEffect(() => {
    connectWs();
    fetchCityHttp();

    return () => {
      abortControllerRef.current?.abort();
      wsRef.current?.close(1000, "Component unmounted");
    };
  }, [connectWs, fetchCityHttp]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const runQuery = useCallback(
    async (sql: string) => {
      setLoading(true);
      setError(null);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "run_query", payload: { sql } }));
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const resp = await fetch("/api/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({ sql }),
          signal: controller.signal,
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || "Failed to execute query.");
        }

        setTimeline(data as VisualTimeline);
        setError(null);
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const explainQuery = useCallback(
    async (sql: string) => {
      setLoading(true);
      setError(null);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "explain_query", payload: { sql } }));
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const resp = await fetch("/api/query/explain-only", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({ sql }),
          signal: controller.signal,
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || "Failed to explain query.");
        }

        setTimeline(data as VisualTimeline);
        setError(null);
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const cancelQuery = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel_query" }));
    }
    abortControllerRef.current?.abort();
    setLoading(false);
  }, []);

  const refreshCity = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "get_city" }));
    } else {
      fetchCityHttp();
    }
  }, [fetchCityHttp]);

  const clearError = useCallback(() => setError(null), []);

  return {
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
    clearError,
  };
}
