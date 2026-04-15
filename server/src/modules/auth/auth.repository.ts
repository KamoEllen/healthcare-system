import { PoolClient } from 'pg';
import { query, getClient } from '../../database';
import { UserRow, PatientRow, RefreshTokenRow } from '../../types';

export const authRepository = {
  async findUserByEmail(email: string): Promise<UserRow | null> {
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    return result.rows[0] ?? null;
  },

  async findUserById(id: string): Promise<UserRow | null> {
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] ?? null;
  },

  async createUserWithPatient(
    email: string,
    passwordHash: string,
    firstName: string,
    lastName: string,
    dateOfBirth?: string,
    bloodType?: string,
    emergencyContact?: string
  ): Promise<UserRow> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, role, first_name, last_name)
         VALUES ($1, $2, 'patient', $3, $4)
         RETURNING *`,
        [email, passwordHash, firstName, lastName]
      );
      const user = userResult.rows[0];

      await client.query<PatientRow>(
        `INSERT INTO patients (user_id, date_of_birth, blood_type, emergency_contact)
         VALUES ($1, $2, $3, $4)`,
        [user.id, dateOfBirth ?? null, bloodType ?? null, emergencyContact ?? null]
      );

      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async createEmailVerificationToken(userId: string, token: string): Promise<void> {
    await query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [userId, token]
    );
  },

  async verifyEmailToken(token: string): Promise<string | null> {
    const result = await query<{ user_id: string }>(
      `SELECT user_id FROM email_verification_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token]
    );
    if (!result.rows[0]) return null;

    const userId = result.rows[0].user_id;

    await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE token = $1', [token]);
    await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);

    return userId;
  },

  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  },

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | null> {
    const result = await query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1 AND is_revoked = false AND expires_at > NOW()`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  },

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await query(
      'UPDATE refresh_tokens SET is_revoked = true WHERE token_hash = $1',
      [tokenHash]
    );
  },

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await query(
      'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1',
      [userId]
    );
  },

  async createPasswordResetToken(userId: string, token: string): Promise<void> {
    // Expire any existing tokens first
    await query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );

    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [userId, token]
    );
  },

  async findPasswordResetToken(token: string): Promise<{ user_id: string } | null> {
    const result = await query<{ user_id: string }>(
      `SELECT user_id FROM password_reset_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token]
    );
    return result.rows[0] ?? null;
  },

  async resetPassword(
    userId: string,
    passwordHash: string,
    resetToken: string
  ): Promise<void> {
    const client: PoolClient = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1',
        [resetToken]
      );
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );
      await client.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1',
        [userId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
