import { describe, it, expect } from "vitest";
import {
  registerWithEmail,
  loginWithEmail,
  generateToken,
  verifyAuthToken,
  getGoogleClientId,
} from "../auth.js";

describe("Authentication Service", () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: "securePassword123!",
    name: "Test Developer",
  };

  it("registers a new user with email and password", async () => {
    const res = await registerWithEmail(testUser.email, testUser.password, testUser.name);
    expect(res).toBeDefined();
    expect(res.user.email).toBe(testUser.email.toLowerCase());
    expect(res.user.name).toBe(testUser.name);
    expect(res.user.provider).toBe("local");
    expect(res.token).toBeTypeOf("string");
    expect(res.token.length).toBeGreaterThan(20);
  });

  it("rejects duplicate email registration", async () => {
    await expect(
      registerWithEmail(testUser.email, "anotherPassword", "Duplicate")
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects invalid email formats", async () => {
    await expect(
      registerWithEmail("invalid-email", "validPass123", "User")
    ).rejects.toThrow(/valid email/i);
  });

  it("rejects weak/short passwords (< 6 characters)", async () => {
    await expect(
      registerWithEmail("valid@example.com", "123", "User")
    ).rejects.toThrow(/at least 6 characters/i);
  });

  it("logs in an existing user with valid credentials", async () => {
    const res = await loginWithEmail(testUser.email, testUser.password);
    expect(res).toBeDefined();
    expect(res.user.email).toBe(testUser.email.toLowerCase());
    expect(res.token).toBeTypeOf("string");
  });

  it("rejects login with incorrect password", async () => {
    await expect(
      loginWithEmail(testUser.email, "wrongPassword123")
    ).rejects.toThrow(/invalid email or password/i);
  });

  it("rejects login with nonexistent email", async () => {
    await expect(
      loginWithEmail("nobody-exists-here@example.com", "somePassword")
    ).rejects.toThrow(/invalid email or password/i);
  });

  it("generates and verifies valid JWT tokens", () => {
    const token = generateToken({
      id: 999,
      email: "jwt-test@example.com",
      name: "JWT User",
      provider: "local",
    });

    const decoded = verifyAuthToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.email).toBe("jwt-test@example.com");
    expect(decoded?.name).toBe("JWT User");
  });

  it("returns null for tampered or invalid JWT tokens", () => {
    const invalid = verifyAuthToken("fake.invalid.token");
    expect(invalid).toBeNull();
  });

  it("reports Google OAuth configuration accurately", () => {
    const id = getGoogleClientId();
    expect(typeof id).toBe("string");
  });
});
