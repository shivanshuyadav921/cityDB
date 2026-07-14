import { describe, it, expect } from "vitest";
import { assertVisualizableQuery } from "../validation.js";

describe("assertVisualizableQuery", () => {
  it("accepts a valid SELECT", () => {
    expect(() =>
      assertVisualizableQuery("SELECT * FROM users")
    ).not.toThrow();
  });

  it("accepts SELECT with trailing semicolon", () => {
    expect(() =>
      assertVisualizableQuery("SELECT id FROM orders;")
    ).not.toThrow();
  });

  it("accepts case-insensitive SELECT", () => {
    expect(() =>
      assertVisualizableQuery("select id from users where id = 1")
    ).not.toThrow();
  });

  it("throws on non-string input", () => {
    expect(() => assertVisualizableQuery(42)).toThrow("SQL must be a string");
    expect(() => assertVisualizableQuery(null)).toThrow("SQL must be a string");
    expect(() => assertVisualizableQuery(undefined)).toThrow(
      "SQL must be a string"
    );
  });

  it("throws on empty string", () => {
    expect(() => assertVisualizableQuery("")).toThrow();
    expect(() => assertVisualizableQuery("   ")).toThrow();
  });

  it("throws on query exceeding max length", () => {
    expect(() => assertVisualizableQuery("SELECT " + "a".repeat(50_000))).toThrow(
      "too large"
    );
  });

  it("throws on SQL comments (double dash)", () => {
    expect(() =>
      assertVisualizableQuery("SELECT * FROM users -- comment")
    ).toThrow("comments");
  });

  it("throws on SQL comments (block comment)", () => {
    expect(() =>
      assertVisualizableQuery("SELECT /* comment */ * FROM users")
    ).toThrow("comments");
  });

  it("throws on multiple statements", () => {
    expect(() =>
      assertVisualizableQuery("SELECT 1; SELECT 2")
    ).toThrow("one SQL statement");
  });

  it("throws on non-SELECT statement in production mode", () => {
    // NODE_ENV defaults to 'test' in vitest, but DEVELOPMENT_MODE is not set
    expect(() =>
      assertVisualizableQuery("INSERT INTO users VALUES (1)")
    ).toThrow();
  });

  it("throws when DROP is embedded inside SELECT", () => {
    expect(() =>
      assertVisualizableQuery("SELECT DROP FROM users")
    ).toThrow("restricted keyword");
  });

  it("throws on UPDATE keyword inside SELECT", () => {
    expect(() =>
      assertVisualizableQuery("SELECT UPDATE FROM users")
    ).toThrow("restricted keyword");
  });
});
