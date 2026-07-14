/**
 * Unit tests for postgres.ts pure/exportable functions.
 * Database-dependent functions (runExplain, getCityMetadata, etc.) are not
 * tested here — they require a live PostgreSQL instance and are covered by
 * integration tests run against docker-compose.
 */

import { describe, it, expect } from "vitest";
import { classifyScale } from "../postgres.js";

// ─── classifyScale ─────────────────────────────────────────────────────────

describe("classifyScale", () => {
  it("classifies 0 rows as village", () => {
    const result = classifyScale(0);
    expect(result.scale).toBe("village");
    expect(result.gridSize).toBe(8);
  });

  it("classifies 999 rows as village", () => {
    expect(classifyScale(999).scale).toBe("village");
  });

  it("classifies exactly 1000 rows as town", () => {
    const result = classifyScale(1000);
    expect(result.scale).toBe("town");
    expect(result.gridSize).toBe(20);
  });

  it("classifies 99999 rows as town", () => {
    expect(classifyScale(99999).scale).toBe("town");
  });

  it("classifies exactly 100000 rows as megacity", () => {
    const result = classifyScale(100000);
    expect(result.scale).toBe("megacity");
    expect(result.gridSize).toBe(40);
  });

  it("classifies very large tables as megacity", () => {
    expect(classifyScale(10_000_000).scale).toBe("megacity");
    expect(classifyScale(10_000_000).gridSize).toBe(40);
  });

  it("always returns a numeric gridSize", () => {
    for (const n of [0, 500, 1000, 50000, 100000, 1_000_000]) {
      expect(typeof classifyScale(n).gridSize).toBe("number");
    }
  });
});
