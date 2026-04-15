import { query, getClient } from '../../database';
import bcrypt from 'bcryptjs';

export interface DoctorWithUser {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  specialisation: string;
  licence_number: string;
  created_at: Date;
  updated_at: Date;
}

export const doctorsRepository = {
  async findAll(limit: number, offset: number): Promise<{ rows: DoctorWithUser[]; total: number }> {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.deleted_at IS NULL`
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await query<DoctorWithUser>(
      `SELECT d.id, d.user_id, u.email, u.first_name, u.last_name,
              d.specialisation, d.licence_number, d.created_at, d.updated_at
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE u.deleted_at IS NULL
       ORDER BY d.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { rows: result.rows, total };
  },

  async findById(id: string): Promise<DoctorWithUser | null> {
    const result = await query<DoctorWithUser>(
      `SELECT d.id, d.user_id, u.email, u.first_name, u.last_name,
              d.specialisation, d.licence_number, d.created_at, d.updated_at
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async findByUserId(userId: string): Promise<DoctorWithUser | null> {
    const result = await query<DoctorWithUser>(
      `SELECT d.id, d.user_id, u.email, u.first_name, u.last_name,
              d.specialisation, d.licence_number, d.created_at, d.updated_at
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return result.rows[0] ?? null;
  },

  async create(dto: { email: string; passwordHash: string; firstName: string; lastName: string; specialisation: string; licenceNumber: string }): Promise<DoctorWithUser> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified)
         VALUES ($1, $2, 'doctor', $3, $4, true) RETURNING id`,
        [dto.email, dto.passwordHash, dto.firstName, dto.lastName]
      );
      const userId = userResult.rows[0].id;
      const doctorResult = await client.query<{ id: string }>(
        `INSERT INTO doctors (user_id, specialisation, licence_number) VALUES ($1, $2, $3) RETURNING id`,
        [userId, dto.specialisation, dto.licenceNumber]
      );
      await client.query('COMMIT');
      const doctor = await doctorsRepository.findById(doctorResult.rows[0].id);
      return doctor!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async update(id: string, dto: { specialisation?: string; first_name?: string; last_name?: string }): Promise<DoctorWithUser | null> {
    const doctorFields: string[] = [];
    const userFields: string[] = [];
    const doctorValues: unknown[] = [];
    const userValues: unknown[] = [];
    let di = 1, ui = 1;
    if (dto.specialisation !== undefined) { doctorFields.push(`specialisation = $${di++}`); doctorValues.push(dto.specialisation); }
    if (dto.first_name     !== undefined) { userFields.push(`first_name = $${ui++}`);  userValues.push(dto.first_name); }
    if (dto.last_name      !== undefined) { userFields.push(`last_name = $${ui++}`);   userValues.push(dto.last_name); }

    if (doctorFields.length > 0) {
      doctorValues.push(id);
      await query(`UPDATE doctors SET ${doctorFields.join(',')}, updated_at=NOW() WHERE id=$${di}`, doctorValues);
    }
    if (userFields.length > 0) {
      const doctor = await doctorsRepository.findById(id);
      if (doctor) {
        userValues.push(doctor.user_id);
        await query(`UPDATE users SET ${userFields.join(',')}, updated_at=NOW() WHERE id=$${ui}`, userValues);
      }
    }
    return doctorsRepository.findById(id);
  },
};
