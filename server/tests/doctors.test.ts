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
      `INSERT INTO doctors (user_id, specialisation, licence_number) VALUES ($1,'Cardiology',$2) RETURNING id`,
      [userId, `LIC-${Date.now()}`]
    );
    profileId = r.rows[0].id;
  }
  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password1!' });
  return { userId, profileId, email, token: loginRes.body.data.accessToken };
}

describe('GET /api/v1/doctors', () => {
  it('all authenticated users can list doctors', async () => {
    const patient = await createUser('patient');
    const res = await request(app).get('/api/v1/doctors').set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/doctors');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/doctors (admin creates doctor)', () => {
  it('admin can create a doctor account', async () => {
    const admin = await createUser('admin');
    const res = await request(app)
      .post('/api/v1/doctors')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        email: `newdoc_${Date.now()}@test.com`,
        password: 'Password1!',
        first_name: 'Dr',
        last_name: 'New',
        specialisation: 'Neurology',
        licence_number: `LIC-NEW-${Date.now()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.specialisation).toBe('Neurology');
  });

  it('patient cannot create doctor', async () => {
    const patient = await createUser('patient');
    const res = await request(app)
      .post('/api/v1/doctors')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ email: 'doc@test.com', password: 'Password1!', first_name:'D', last_name:'R', specialisation:'GP', licence_number:'LIC-X' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/doctors/me', () => {
  it('doctor gets own profile', async () => {
    const doctor = await createUser('doctor');
    const res = await request(app).get('/api/v1/doctors/me').set('Authorization', `Bearer ${doctor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user_id).toBe(doctor.userId);
  });
});

describe('PATCH /api/v1/doctors/:id', () => {
  it('doctor can update own specialisation', async () => {
    const doctor = await createUser('doctor');
    const res = await request(app)
      .patch(`/api/v1/doctors/${doctor.profileId}`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ specialisation: 'Oncology' });
    expect(res.status).toBe(200);
    expect(res.body.data.specialisation).toBe('Oncology');
  });

  it('doctor cannot update another doctor profile', async () => {
    const d1 = await createUser('doctor');
    const d2 = await createUser('doctor');
    const res = await request(app)
      .patch(`/api/v1/doctors/${d2.profileId}`)
      .set('Authorization', `Bearer ${d1.token}`)
      .send({ specialisation: 'Hack' });
    expect(res.status).toBe(403);
  });
});
