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

describe('GET /api/v1/patients', () => {
  it('admin can list patients', async () => {
    const admin = await createUser('admin');
    await createUser('patient');
    const res = await request(app).get('/api/v1/patients').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('doctor can list patients', async () => {
    const doctor = await createUser('doctor');
    const res = await request(app).get('/api/v1/patients').set('Authorization', `Bearer ${doctor.token}`);
    expect(res.status).toBe(200);
  });

  it('patient cannot list all patients', async () => {
    const patient = await createUser('patient');
    const res = await request(app).get('/api/v1/patients').set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/patients/me', () => {
  it('patient can get own profile', async () => {
    const patient = await createUser('patient');
    const res = await request(app).get('/api/v1/patients/me').set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user_id).toBe(patient.userId);
  });
});

describe('GET /api/v1/patients/:id', () => {
  it('patient can get own profile by id', async () => {
    const patient = await createUser('patient');
    const res = await request(app)
      .get(`/api/v1/patients/${patient.profileId}`)
      .set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(200);
  });

  it('patient cannot get another patient profile', async () => {
    const p1 = await createUser('patient');
    const p2 = await createUser('patient');
    const res = await request(app)
      .get(`/api/v1/patients/${p2.profileId}`)
      .set('Authorization', `Bearer ${p1.token}`);
    expect(res.status).toBe(403);
  });

  it('admin can get any patient', async () => {
    const admin = await createUser('admin');
    const patient = await createUser('patient');
    const res = await request(app)
      .get(`/api/v1/patients/${patient.profileId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/patients/:id', () => {
  it('patient can update own profile', async () => {
    const patient = await createUser('patient');
    const res = await request(app)
      .patch(`/api/v1/patients/${patient.profileId}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ blood_type: 'O+' });
    expect(res.status).toBe(200);
    expect(res.body.data.blood_type).toBe('O+');
  });

  it('patient cannot update another patient profile', async () => {
    const p1 = await createUser('patient');
    const p2 = await createUser('patient');
    const res = await request(app)
      .patch(`/api/v1/patients/${p2.profileId}`)
      .set('Authorization', `Bearer ${p1.token}`)
      .send({ blood_type: 'A+' });
    expect(res.status).toBe(403);
  });
});
