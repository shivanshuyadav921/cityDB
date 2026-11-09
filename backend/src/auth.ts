import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "./postgres.js";
import { logger } from "./logger.js";

export interface AuthUser {
  id: number | string;
  email: string;
  name: string;
  avatar_url?: string | null;
  provider: "local" | "google";
  created_at?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "citydb-super-secret-jwt-key-2026";
const JWT_EXPIRES_IN = "7d";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";

// In-memory fallback in case Postgres is not reachable
const fallbackUsers = new Map<string, { user: AuthUser; passwordHash?: string }>();

let tableInitialized = false;

/** Initialize the auth_users table in PostgreSQL if available */
export async function initAuthTable(): Promise<void> {
  if (tableInitialized) return;
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        provider VARCHAR(50) DEFAULT 'local',
        google_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
      CREATE INDEX IF NOT EXISTS idx_auth_users_google_id ON auth_users(google_id);
    `);
    tableInitialized = true;
    logger.info("auth_table_initialized");
  } catch (err) {
    logger.warn("auth_table_init_fallback", {
      message: (err as Error).message,
      note: "Using in-memory store until database becomes available.",
    });
  }
}

/** Create signed JWT token */
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Verify JWT token and extract payload */
export function verifyAuthToken(token: string): { userId: number | string; email: string; name: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number | string;
      email: string;
      name: string;
    };
    return decoded;
  } catch {
    return null;
  }
}

/** Register new user with email and password */
export async function registerWithEmail(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("A valid email address is required.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  if (!cleanName) {
    throw new Error("Name is required.");
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  try {
    await initAuthTable();
    const pool = getPool();
    const existing = await pool.query<{ id: number }>(
      "SELECT id FROM auth_users WHERE email = $1",
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      throw new Error("An account with this email already exists.");
    }

    const res = await pool.query<AuthUser>(
      `INSERT INTO auth_users (email, password_hash, name, provider)
       VALUES ($1, $2, $3, 'local')
       RETURNING id, email, name, avatar_url, provider, created_at`,
      [cleanEmail, passwordHash, cleanName]
    );

    const user = res.rows[0];
    const token = generateToken(user);
    return { user, token };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    if (errorMsg.includes("already exists")) {
      throw err;
    }

    // Fallback to in-memory if DB fails
    logger.warn("register_db_fallback", { error: errorMsg });
    if (fallbackUsers.has(cleanEmail)) {
      throw new Error("An account with this email already exists.");
    }

    const fallbackUser: AuthUser = {
      id: Date.now(),
      email: cleanEmail,
      name: cleanName,
      provider: "local",
      created_at: new Date().toISOString(),
    };
    fallbackUsers.set(cleanEmail, { user: fallbackUser, passwordHash });
    const token = generateToken(fallbackUser);
    return { user: fallbackUser, token };
  }
}

/** Login with email and password */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }

  try {
    await initAuthTable();
    const pool = getPool();
    const res = await pool.query<{
      id: number;
      email: string;
      name: string;
      password_hash: string | null;
      avatar_url: string | null;
      provider: "local" | "google";
      created_at: string;
    }>(
      `SELECT id, email, name, password_hash, avatar_url, provider, created_at
       FROM auth_users WHERE email = $1`,
      [cleanEmail]
    );

    if (res.rows.length === 0) {
      throw new Error("Invalid email or password.");
    }

    const record = res.rows[0];
    if (!record.password_hash) {
      throw new Error(
        `This account was created via ${record.provider}. Please sign in with Google.`
      );
    }

    const isMatch = await bcrypt.compare(password, record.password_hash);
    if (!isMatch) {
      throw new Error("Invalid email or password.");
    }

    const user: AuthUser = {
      id: record.id,
      email: record.email,
      name: record.name,
      avatar_url: record.avatar_url,
      provider: record.provider,
      created_at: record.created_at,
    };
    const token = generateToken(user);
    return { user, token };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    if (
      errorMsg.includes("Invalid email or password") ||
      errorMsg.includes("Please sign in with Google")
    ) {
      throw err;
    }

    // Try in-memory fallback
    const fallback = fallbackUsers.get(cleanEmail);
    if (!fallback || !fallback.passwordHash) {
      throw new Error("Invalid email or password.");
    }

    const isMatch = await bcrypt.compare(password, fallback.passwordHash);
    if (!isMatch) {
      throw new Error("Invalid email or password.");
    }

    const token = generateToken(fallback.user);
    return { user: fallback.user, token };
  }
}

/** Verify Google ID token and login or create user */
export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  if (!credential) {
    throw new Error("Google credential token is required.");
  }

  // Verify the ID token via Google's tokeninfo API
  const tokeninfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const resp = await fetch(tokeninfoUrl);
  if (!resp.ok) {
    const errorBody = await resp.text();
    logger.warn("google_token_verify_failed", { status: resp.status, body: errorBody });
    throw new Error("Invalid Google credential token. Verification failed.");
  }

  const payload = (await resp.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
    aud?: string;
    email_verified?: string | boolean;
  };

  if (!payload.email) {
    throw new Error("Google account did not provide an email address.");
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name || email.split("@")[0] || "Google User";
  const avatar = payload.picture || null;

  try {
    await initAuthTable();
    const pool = getPool();

    // Check if user exists by google_id or email
    const existing = await pool.query<{
      id: number;
      email: string;
      name: string;
      avatar_url: string | null;
      provider: "local" | "google";
      created_at: string;
    }>(
      `SELECT id, email, name, avatar_url, provider, created_at
       FROM auth_users WHERE google_id = $1 OR email = $2`,
      [googleId, email]
    );

    let user: AuthUser;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      // Update google_id and avatar if missing
      await pool.query(
        `UPDATE auth_users
         SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW()
         WHERE id = $3`,
        [googleId, avatar, row.id]
      );
      user = {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar_url: row.avatar_url || avatar,
        provider: "google",
        created_at: row.created_at,
      };
    } else {
      const inserted = await pool.query<AuthUser>(
        `INSERT INTO auth_users (email, name, avatar_url, provider, google_id)
         VALUES ($1, $2, $3, 'google', $4)
         RETURNING id, email, name, avatar_url, provider, created_at`,
        [email, name, avatar, googleId]
      );
      user = inserted.rows[0];
    }

    const token = generateToken(user);
    return { user, token };
  } catch (err: unknown) {
    logger.warn("google_auth_db_fallback", { error: (err as Error).message });
    const fallbackUser: AuthUser = {
      id: googleId,
      email,
      name,
      avatar_url: avatar,
      provider: "google",
      created_at: new Date().toISOString(),
    };
    fallbackUsers.set(email, { user: fallbackUser });
    const token = generateToken(fallbackUser);
    return { user: fallbackUser, token };
  }
}

/** Get user profile from token or user ID */
export async function getUserProfile(userId: number | string): Promise<AuthUser | null> {
  try {
    await initAuthTable();
    const pool = getPool();
    const res = await pool.query<AuthUser>(
      `SELECT id, email, name, avatar_url, provider, created_at
       FROM auth_users WHERE id = $1`,
      [userId]
    );
    if (res.rows.length > 0) {
      return res.rows[0];
    }
  } catch {
    // try fallback
  }

  for (const [, val] of fallbackUsers.entries()) {
    if (String(val.user.id) === String(userId)) {
      return val.user;
    }
  }

  return null;
}

/** Check if Google OAuth client ID is configured */
export function getGoogleClientId(): string {
  return GOOGLE_CLIENT_ID;
}
