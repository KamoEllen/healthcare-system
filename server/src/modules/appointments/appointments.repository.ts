import { query, getClient } from '../../database';
import { AppointmentStatus } from '../../types';

export interface AppointmentWithDetails {
  id: string;
  patient_id: string;
  doctor_id: string;
  patient_first_name: string;
  patient_last_name: string;
  doctor_first_name: string;
  doctor_last_name: string;
  doctor_specialisation: string;
  scheduled_at: Date;
  status: AppointmentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT_APPOINTMENT = `
  SELECT
    a.id, a.patient_id, a.doctor_id,
    pu.first_name AS patient_first_name, pu.last_name AS patient_last_name,
    du.first_name AS doctor_first_name,  du.last_name AS doctor_last_name,
    d.specialisation AS doctor_specialisation,
    a.scheduled_at, a.status, a.notes, a.created_at, a.updated_at
  FROM appointments a
  JOIN patients p  ON p.id  = a.patient_id
  JOIN users pu    ON pu.id = p.user_id
  JOIN doctors d   ON d.id  = a.doctor_id
  JOIN users du    ON du.id = d.user_id
`;

export const appointmentsRepository = {
  async findAll(filter: { patientId?: string; doctorId?: string }, limit: number, offset: number): Promise<{ rows: AppointmentWithDetails[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (filter.patientId) { conditions.push(`a.patient_id = $${i++}`); values.push(filter.patientId); }
    if (filter.doctorId)  { conditions.push(`a.doctor_id  = $${i++}`);  values.push(filter.doctorId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM appointments a ${where}`, values
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await query<AppointmentWithDetails>(
      `${SELECT_APPOINTMENT} ${where} ORDER BY a.scheduled_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...values, limit, offset]
    );
    return { rows: result.rows, total };
  },

  async findById(id: string): Promise<AppointmentWithDetails | null> {
    const result = await query<AppointmentWithDetails>(
      `${SELECT_APPOINTMENT} WHERE a.id = $1`, [id]
    );
    return result.rows[0] ?? null;
  },

  async isSlotTaken(doctorId: string, scheduledAt: string): Promise<boolean> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) FROM appointments WHERE doctor_id = $1 AND scheduled_at = $2 AND status != 'cancelled'`,
      [doctorId, scheduledAt]
    );
    return parseInt(result.rows[0].count, 10) > 0;
  },

  async create(patientId: string, doctorId: string, scheduledAt: string, notes?: string): Promise<AppointmentWithDetails> {
    const result = await query<{ id: string }>(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [patientId, doctorId, scheduledAt, notes ?? null]
    );
    return (await appointmentsRepository.findById(result.rows[0].id))!;
  },

  async updateStatus(id: string, status: AppointmentStatus, actorUserId: string): Promise<AppointmentWithDetails | null> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, id]
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource, resource_id, metadata)
         VALUES ($1, $2, 'appointments', $3, $4)`,
        [actorUserId, `appointment.${status}`, id, JSON.stringify({ status })]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return appointmentsRepository.findById(id);
  },
};
