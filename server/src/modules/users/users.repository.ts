import { query } from '../../database';
import { UserRow } from '../../types';

export const usersRepository = {
  async findAll(limit: number, offset: number): Promise<{ rows: Omit<UserRow,'password_hash'>[]; total: number }> {
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await query<Omit<UserRow,'password_hash'>>(
      `SELECT id, email, role, first_name, last_name, is_active, email_verified, deleted_at, created_at, updated_at
       FROM users WHERE deleted_at IS NULL
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { rows: result.rows, total };
  },

  async findById(id: string): Promise<Omit<UserRow,'password_hash'> | null> {
    const result = await query<Omit<UserRow,'password_hash'>>(
      `SELECT id, email, role, first_name, last_name, is_active, email_verified, deleted_at, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async update(id: string, dto: { first_name?: string; last_name?: string; is_active?: boolean }): Promise<Omit<UserRow,'password_hash'> | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (dto.first_name !== undefined) { fields.push(`first_name = $${i++}`); values.push(dto.first_name); }
    if (dto.last_name  !== undefined) { fields.push(`last_name = $${i++}`);  values.push(dto.last_name); }
    if (dto.is_active  !== undefined) { fields.push(`is_active = $${i++}`);  values.push(dto.is_active); }
    if (fields.length === 0) return usersRepository.findById(id);
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await query<Omit<UserRow,'password_hash'>>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
       RETURNING id, email, role, first_name, last_name, is_active, email_verified, deleted_at, created_at, updated_at`,
      values
    );
    return result.rows[0] ?? null;
  },

  async softDelete(id: string): Promise<boolean> {
    const result = await query(
      'UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
