import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function setupTestDb(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../src/migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const { rows } = await client.query('SELECT id FROM migrations WHERE filename=$1', [file]);
      if (rows.length > 0) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await client.query(sql);
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
    }
  } finally {
    client.release();
  }
}

export async function seedTestDb(): Promise<void> {
  // Seed is done per test in beforeEach
}

export async function truncateTestDb(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      password_reset_tokens,
      email_verification_tokens,
      refresh_tokens,
      audit_logs,
      health_records,
      appointments,
      doctors,
      patients,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function closeTestDb(): Promise<void> {
  await pool.end();
}

export { pool as testPool };
