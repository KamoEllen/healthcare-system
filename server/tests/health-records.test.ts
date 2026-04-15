import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from './helpers/testApp';
import { setupTestDb, truncateTestDb, closeTestDb, testPool } from './helpers/testDb';

beforeAll(async () => { await setupTestDb(); });
beforeEach(async () => { await truncateTestDb(); });
afterAll(async () => { await closeTestDb(); });

async function createUser(role: 'admin'|'doctor'|'patient') {
  const hash = await bcrypt.hash('Password1!', 12);
  const email = `${role}_${Date.now()}@test.com`;
  const result = await testPool.query<{id:string}>(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified)
     VALUES ($1,$2,$3,'Test','User',true) RETURNING id`,
    [email, hash, role]
  );
  const userId = result.rows[0].id;
  let profileId = '';
  if (role === 'patient') {
    const r = await testPool.query<{id:string}>('INSERT INTO patients (user_id) VALUES ($1) RETURNING id', [userId]);
    profileId = r.rows[0].id;
  } else if (role === 'doctor') {
    const r = await testPool.query<{id:string}>(
      `INSERT INTO doctors (user_id, specialisation, licence_number) VALUES ($1,'GP',$2) RETURNING id`,
      [userId, `LIC-${Date.now()}`]
    );
    profileId = r.rows[0].id;
  }
  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password1!' });
  return { userId, profileId, email, token: loginRes.body.data.accessToken };
}

describe('POST /api/v1/health-records', () => {
  it('doctor can create health record', async () => {
    const doctor  = await createUser('doctor');
    const patient = await createUser('patient');
    const res = await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_id: patient.profileId, diagnosis: 'Flu', prescription: 'Rest' });
    expect(res.status).toBe(201);
    expect(res.body.data.diagnosis).toBe('Flu');
  });

  it('patient cannot create health record', async () => {
    const patient1 = await createUser('patient');
    const patient2 = await createUser('patient');
    const res = await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${patient1.token}`)
      .send({ patient_id: patient2.profileId, diagnosis: 'X' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing diagnosis', async () => {
    const doctor  = await createUser('doctor');
    const patient = await createUser('patient');
    const res = await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_id: patient.profileId });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/health-records', () => {
  it('patient only sees own records', async () => {
    const doctor   = await createUser('doctor');
    const patient1 = await createUser('patient');
    const patient2 = await createUser('patient');
    await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_id: patient1.profileId, diagnosis: 'Flu' });
    await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_id: patient2.profileId, diagnosis: 'Cold' });
    const res = await request(app)
      .get('/api/v1/health-records')
      .set('Authorization', `Bearer ${patient1.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: { patient_id: string }) => r.patient_id === patient1.profileId)).toBe(true);
  });
});

describe('PATCH /api/v1/health-records/:id', () => {
  it('doctor can update own record within 24h', async () => {
    const doctor  = await createUser('doctor');
    const patient = await createUser('patient');
    const createRes = await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_id: patient.profileId, diagnosis: 'Flu' });
    const recordId = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/health-records/${recordId}`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Updated Flu' });
    expect(res.status).toBe(200);
    expect(res.body.data.diagnosis).toBe('Updated Flu');
  });

  it('doctor cannot update record older than 24h', async () => {
    const doctor  = await createUser('doctor');
    const patient = await createUser('patient');
    const createRes = await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ patient_id: patient.profileId, diagnosis: 'Old' });
    const recordId = createRes.body.data.id;
    // Backdate the record by 25 hours
    await testPool.query(
      `UPDATE health_records SET created_at = NOW() - INTERVAL '25 hours' WHERE id = $1`,
      [recordId]
    );
    const res = await request(app)
      .patch(`/api/v1/health-records/${recordId}`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ diagnosis: 'Should fail' });
    expect(res.status).toBe(403);
  });

  it('doctor cannot update another doctor record', async () => {
    const d1      = await createUser('doctor');
    const d2      = await createUser('doctor');
    const patient = await createUser('patient');
    const createRes = await request(app)
      .post('/api/v1/health-records')
      .set('Authorization', `Bearer ${d1.token}`)
      .send({ patient_id: patient.profileId, diagnosis: 'D1 Record' });
    const recordId = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/health-records/${recordId}`)
      .set('Authorization', `Bearer ${d2.token}`)
      .send({ diagnosis: 'Hacked' });
    expect(res.status).toBe(403);
  });
});
