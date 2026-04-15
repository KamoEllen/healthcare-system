import { query, getClient } from '../../database';

export interface HealthRecordWithDetails {
  id: string;
  patient_id: string;
  doctor_id: string;
  patient_first_name: string;
  patient_last_name: string;
  doctor_first_name: string;
  doctor_last_name: string;
  diagnosis: string;
  prescription: string | null;
  notes: string | null;
  recorded_at: Date;
  created_at: Date;
  updated_at: Date;
}

const SELECT_HR = `
  SELECT
    hr.id, hr.patient_id, hr.doctor_id,
    pu.first_name AS patient_first_name, pu.last_name AS patient_last_name,
    du.first_name AS doctor_first_name,  du.last_name AS doctor_last_name,
    hr.diagnosis, hr.prescription, hr.notes, hr.recorded_at, hr.created_at, hr.updated_at
  FROM health_records hr
  JOIN patients p  ON p.id  = hr.patient_id
  JOIN users pu    ON pu.id = p.user_id
  JOIN doctors d   ON d.id  = hr.doctor_id
  JOIN users du    ON du.id = d.user_id
`;

export const healthRecordsRepository = {
  async findAll(filter: { patientId?: string; doctorId?: string }, limit: number, offset: number): Promise<{ rows: HealthRecordWithDetails[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (filter.patientId) { conditions.push(`hr.patient_id = $${i++}`); values.push(filter.patientId); }
    if (filter.doctorId)  { conditions.push(`hr.doctor_id  = $${i++}`);  values.push(filter.doctorId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM health_records hr ${where}`, values
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await query<HealthRecordWithDetails>(
      `${SELECT_HR} ${where} ORDER BY hr.created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...values, limit, offset]
    );
    return { rows: result.rows, total };
  },

  async findById(id: string): Promise<HealthRecordWithDetails | null> {
    const result = await query<HealthRecordWithDetails>(
      `${SELECT_HR} WHERE hr.id = $1`, [id]
    );
    return result.rows[0] ?? null;
  },

  async create(patientId: string, doctorId: string, actorUserId: string, diagnosis: string, prescription?: string, notes?: string): Promise<HealthRecordWithDetails> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(
        `INSERT INTO health_records (patient_id, doctor_id, diagnosis, prescription, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [patientId, doctorId, diagnosis, prescription ?? null, notes ?? null]
      );
      const id = result.rows[0].id;
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource, resource_id)
         VALUES ($1, 'health_record.created', 'health_records', $2)`,
        [actorUserId, id]
      );
      await client.query('COMMIT');
      return (await healthRecordsRepository.findById(id))!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async update(id: string, dto: { diagnosis?: string; prescription?: string; notes?: string }): Promise<HealthRecordWithDetails | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (dto.diagnosis    !== undefined) { fields.push(`diagnosis = $${i++}`);    values.push(dto.diagnosis); }
    if (dto.prescription !== undefined) { fields.push(`prescription = $${i++}`); values.push(dto.prescription); }
    if (dto.notes        !== undefined) { fields.push(`notes = $${i++}`);        values.push(dto.notes); }
    if (fields.length === 0) return healthRecordsRepository.findById(id);
    fields.push('updated_at = NOW()');
    values.push(id);
    await query(`UPDATE health_records SET ${fields.join(', ')} WHERE id = $${i}`, values);
    return healthRecordsRepository.findById(id);
  },
};
