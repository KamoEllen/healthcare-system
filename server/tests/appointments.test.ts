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

function futureDate(offsetMinutes = 60): string {
  return new Date(Date.now() + offsetMinutes * 60000).toISOString();
}

describe('POST /api/v1/appointments (book)', () => {
  it('patient can book an appointment', async () => {
    const patient = await createUser('patient');
    const doctor  = await createUser('doctor');
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  it('prevents double-booking the same slot', async () => {
    const patient1 = await createUser('patient');
    const patient2 = await createUser('patient');
    const doctor   = await createUser('doctor');
    const slot = futureDate(120);
    await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient1.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: slot });
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient2.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: slot });
    expect(res.status).toBe(409);
  });

  it('doctor cannot book appointment', async () => {
    const doctor = await createUser('doctor');
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/appointments/:id/status', () => {
  it('doctor can confirm appointment', async () => {
    const patient = await createUser('patient');
    const doctor  = await createUser('doctor');
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    const apptId = bookRes.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
  });

  it('patient cannot update appointment status', async () => {
    const patient = await createUser('patient');
    const doctor  = await createUser('doctor');
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    const apptId = bookRes.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/appointments/:id (cancel)', () => {
  it('patient can cancel own pending appointment', async () => {
    const patient = await createUser('patient');
    const doctor  = await createUser('doctor');
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    const apptId = bookRes.body.data.id;
    const res = await request(app)
      .delete(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('patient cannot cancel another patient appointment', async () => {
    const p1     = await createUser('patient');
    const p2     = await createUser('patient');
    const doctor = await createUser('doctor');
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${p1.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    const apptId = bookRes.body.data.id;
    const res = await request(app)
      .delete(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${p2.token}`);
    expect(res.status).toBe(403);
  });

  it('patient cannot cancel a confirmed appointment', async () => {
    const patient = await createUser('patient');
    const doctor  = await createUser('doctor');
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ doctor_id: doctor.profileId, scheduled_at: futureDate() });
    const apptId = bookRes.body.data.id;
    await request(app)
      .patch(`/api/v1/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ status: 'confirmed' });
    const res = await request(app)
      .delete(`/api/v1/appointments/${apptId}`)
      .set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(409);
  });
});
