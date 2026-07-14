import { getPool } from "./postgres.js";
import { logger } from "./logger.js";

async function seed() {
  const pool = getPool();

  logger.info("seed_start", { step: "schema" });
  await pool.query(`DROP TABLE IF EXISTS users CASCADE;`);
  await pool.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      salary INTEGER NOT NULL,
      department TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  logger.info("seed_start", { step: "data", rows: 100000 });
  const departments = ["engineering", "sales", "marketing", "support", "finance"];
  const batchSize = 5000;
  const total = 100000;

  for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let i = batchStart; i < Math.min(batchStart + batchSize, total); i++) {
      const email = `user${i}@example.com`;
      const name = `User ${i}`;
      const salary = 40000 + Math.floor(Math.random() * 120000);
      const department = departments[i % departments.length];
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`
      );
      params.push(email, name, salary, department);
      paramIdx += 4;
    }

    await pool.query(
      `INSERT INTO users (email, name, salary, department) VALUES ${values.join(",")}`,
      params
    );
    logger.info("seed_progress", {
      inserted: Math.min(batchStart + batchSize, total),
      total,
    });
  }

  // Plant one findable needle for the demo
  await pool.query(
    `UPDATE users SET email = 'alice@example.com' WHERE id = 42;`
  );

  logger.info("seed_complete", {
    demoRow: "alice@example.com",
    demoId: 42,
    hint: "Run: CREATE INDEX idx_users_email ON users(email); to see the beam appear.",
  });
  await pool.end();
}

seed().catch((err) => {
  logger.error("seed_failed", { message: (err as Error).message });
  process.exit(1);
});
