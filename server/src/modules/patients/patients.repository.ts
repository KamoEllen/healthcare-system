import { query } from '../../database';

export interface PatientWithUser {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: Date | null;
  blood_type: string | null;
  emergency_contact: string | null;
  created_at: Date;
  updated_at: Date;
}

export const patientsRepository = {
  async findAll(limit: number, offset: number): Promise<{ rows: PatientWithUser[]; total: number }> {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM patients p JOIN users u ON u.id = p.user_id WHERE u.deleted_at IS NULL`
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await query<PatientWithUser>(
      `SELECT p.id, p.user_id, u.email, u.first_name, u.last_name,
              p.date_of_birth, p.blood_type, p.emergency_contact, p.created_at, p.updated_at
       FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE u.deleted_at IS NULL
       ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { rows: result.rows, total };
  },

  async findById(id: string): Promise<PatientWithUser | null> {
    const result = await query<PatientWithUser>(
      `SELECT p.id, p.user_id, u.email, u.first_name, u.last_name,
              p.date_of_birth, p.blood_type, p.emergency_contact, p.created_at, p.updated_at
       FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async findByUserId(userId: string): Promise<PatientWithUser | null> {
    const result = await query<PatientWithUser>(
      `SELECT p.id, p.user_id, u.email, u.first_name, u.last_name,
              p.date_of_birth, p.blood_type, p.emergency_contact, p.created_at, p.updated_at
       FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return result.rows[0] ?? null;
  },

  async update(id: string, dto: { date_of_birth?: string; blood_type?: string; emergency_contact?: string }): Promise<PatientWithUser | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (dto.date_of_birth     !== undefined) { fields.push(`p.date_of_birth = $${i++}`);     values.push(dto.date_of_birth); }
    if (dto.blood_type        !== undefined) { fields.push(`p.blood_type = $${i++}`);        values.push(dto.blood_type); }
    if (dto.emergency_contact !== undefined) { fields.push(`p.emergency_contact = $${i++}`); values.push(dto.emergency_contact); }
    if (fields.length === 0) return patientsRepository.findById(id);
    fields.push('p.updated_at = NOW()');
    values.push(id);
    // Build UPDATE with join-style subquery
    const setClause = fields.map(f => f.replace('p.', '')).join(', ');
    const result = await query<PatientWithUser>(
      `UPDATE patients SET ${setClause} WHERE id = $${i}
       RETURNING id, user_id, date_of_birth, blood_type, emergency_contact, created_at, updated_at`,
      values
    );
    if (!result.rows[0]) return null;
    return patientsRepository.findById(id);
  },
};
