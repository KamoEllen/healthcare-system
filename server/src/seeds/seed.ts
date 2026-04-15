import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    console.log('Seeding database...');

    const hash = (pw: string) => bcrypt.hash(pw, 12);

    const adminHash = await hash('admin123');
    const doctorHash = await hash('doctor123');
    const patientHash = await hash('patient123');

    await client.query('BEGIN');

    // Clear existing seed data (idempotent)
    await client.query(`DELETE FROM users WHERE email IN (
      'admin@healthcare.dev','doctor@healthcare.dev','patient@healthcare.dev'
    )`);

    // Admin
    const adminResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified)
       VALUES ($1, $2, 'admin', 'System', 'Admin', true)
       RETURNING id`,
      ['admin@healthcare.dev', adminHash]
    );

    // Doctor
    const doctorResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified)
       VALUES ($1, $2, 'doctor', 'Jane', 'Smith', true)
       RETURNING id`,
      ['doctor@healthcare.dev', doctorHash]
    );
    await client.query(
      `INSERT INTO doctors (user_id, specialisation, licence_number)
       VALUES ($1, 'General Practice', 'GP-001-2024')`,
      [doctorResult.rows[0].id]
    );

    // Patient
    const patientResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified)
       VALUES ($1, $2, 'patient', 'John', 'Doe', true)
       RETURNING id`,
      ['patient@healthcare.dev', patientHash]
    );
    await client.query(
      `INSERT INTO patients (user_id, date_of_birth, blood_type)
       VALUES ($1, '1990-01-15', 'O+')`,
      [patientResult.rows[0].id]
    );

    await client.query('COMMIT');

    console.log('Seed complete');
    console.log('  Admin:   admin@healthcare.dev   / admin123');
    console.log('  Doctor:  doctor@healthcare.dev  / doctor123');
    console.log('  Patient: patient@healthcare.dev / patient123');

    void adminResult;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
