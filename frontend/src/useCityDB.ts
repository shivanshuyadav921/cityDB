import { useCallback, useEffect, useRef, useState } from "react";
import type { CitySnapshot, ServerMessage, VisualTimeline } from "./ir";

// ─── Transport URL derivation ─────────────────────────────────────────────────
// On Railway (and any production deployment), the frontend is served from the
// same Express server as the WebSocket endpoint, so we derive the WS URL from
// window.location automatically. This eliminates hardcoded localhost references.
//
// Override with VITE_WS_URL for custom deployments (e.g. separate backend).

function deriveWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  // SSR / test fallback
  return "ws://localhost:4000/ws";
}

const WS_URL = deriveWsUrl();
const RECONNECT_BASE_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface ApiError {
  error?: string;
}

export interface CityDBState {
  connected: boolean;
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
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connected, setConnected] = useState(false);
  const [city, setCity] = useState<CitySnapshot | null>(null);
  const [timeline, setTimeline] = useState<VisualTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── WebSocket connect / reconnect ──────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: "get_city" }));
    };

    ws.onclose = (event) => {
      setConnected(false);
      setLoading(false);
      if (event.wasClean) return; // intentional close — don't reconnect
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError("Connection failed after maximum retry attempts. Please refresh.");
        return;
      }
      const delay =
        RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current;
      reconnectAttemptsRef.current += 1;
      setError(
        `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s… (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
      );
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      setError("WebSocket connection error.");
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
  }, []);

  // Mount / unmount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      // Close with wasClean=true to prevent reconnect loop on unmount
      wsRef.current?.close(1000, "Component unmounted");
    };
  }, [connect]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const runQuery = useCallback((sql: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server. Please wait for reconnection.");
      return;
    }
    setLoading(true);
    setError(null);
    wsRef.current.send(JSON.stringify({ type: "run_query", payload: { sql } }));
  }, []);

  const explainQuery = useCallback((sql: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server. Please wait for reconnection.");
      return;
    }
    setLoading(true);
    setError(null);
    wsRef.current.send(JSON.stringify({ type: "explain_query", payload: { sql } }));
  }, []);

  const cancelQuery = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel_query" }));
    }
    setLoading(false);
  }, []);

  const refreshCity = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server.");
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "get_city" }));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    connected,
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
