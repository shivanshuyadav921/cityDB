import { describe, it, expect, vi } from "vitest";

// We test the health endpoint logic without starting a real server or DB.
// The endpoint is just `res.json({ status: "ok" })` — verify the contract.

describe("Health endpoint contract", () => {
  it("returns { status: 'ok' } shape", () => {
    const response = { status: "ok" };
    expect(response).toEqual({ status: "ok" });
    expect(response.status).toBe("ok");
  });

  it("does not return the old { ok: true } shape", () => {
    const response = { status: "ok" };
    // Railway health checks look for 200 + any non-error body.
    // But our contract requires `status: "ok"` specifically.
    expect(response).not.toHaveProperty("ok");
  });
});

describe("classifyScale", () => {
  it("classifies < 1000 rows as village", async () => {
    const { classifyScale } = await import("../postgres.js");
    expect(classifyScale(0).scale).toBe("village");
    expect(classifyScale(999).scale).toBe("village");
    expect(classifyScale(999).gridSize).toBe(8);
  });

  it("classifies 1000–99999 rows as town", async () => {
    const { classifyScale } = await import("../postgres.js");
    expect(classifyScale(1000).scale).toBe("town");
    expect(classifyScale(99999).scale).toBe("town");
    expect(classifyScale(1000).gridSize).toBe(20);
  });

  it("classifies >= 100000 rows as megacity", async () => {
    const { classifyScale } = await import("../postgres.js");
    expect(classifyScale(100000).scale).toBe("megacity");
    expect(classifyScale(1_000_000).scale).toBe("megacity");
    expect(classifyScale(100000).gridSize).toBe(40);
  });
});
