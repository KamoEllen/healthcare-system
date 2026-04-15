import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from './helpers/testApp';
import { setupTestDb, truncateTestDb, closeTestDb, testPool } from './helpers/testDb';

beforeAll(async () => { await setupTestDb(); });
beforeEach(async () => { await truncateTestDb(); });
afterAll(async () => { await closeTestDb(); });

async function createUser(role: 'admin'|'doctor'|'patient' = 'patient') {
  const hash = await bcrypt.hash('Password1!', 12);
  const email = `${role}_${Date.now()}@test.com`;
  const result = await testPool.query<{id:string}>(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified)
     VALUES ($1, $2, $3, 'Test', 'User', true) RETURNING id`,
    [email, hash, role]
  );
  const id = result.rows[0].id;
  if (role === 'patient') {
    await testPool.query('INSERT INTO patients (user_id) VALUES ($1)', [id]);
  } else if (role === 'doctor') {
    await testPool.query(
      `INSERT INTO doctors (user_id, specialisation, licence_number) VALUES ($1, 'GP', $2)`,
      [id, `LIC-${Date.now()}`]
    );
  }
  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password1!' });
  return { id, email, token: loginRes.body.data.accessToken };
}

describe('GET /api/v1/users', () => {
  it('admin can list users', async () => {
    const admin = await createUser('admin');
    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toBeDefined();
  });

  it('patient cannot list users', async () => {
    const patient = await createUser('patient');
    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/users/:id', () => {
  it('any authenticated user can get a user by id', async () => {
    const admin = await createUser('admin');
    const patient = await createUser('patient');
    const res = await request(app).get(`/api/v1/users/${patient.id}`).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(patient.id);
  });

  it('returns 404 for non-existent user', async () => {
    const admin = await createUser('admin');
    const res = await request(app)
      .get('/api/v1/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('user can update own profile', async () => {
    const patient = await createUser('patient');
    const res = await request(app)
      .patch(`/api/v1/users/${patient.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ first_name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.first_name).toBe('Updated');
  });

  it('user cannot update another user profile', async () => {
    const patient1 = await createUser('patient');
    const patient2 = await createUser('patient');
    const res = await request(app)
      .patch(`/api/v1/users/${patient2.id}`)
      .set('Authorization', `Bearer ${patient1.token}`)
      .send({ first_name: 'Hack' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/users/:id', () => {
  it('admin can soft delete a user', async () => {
    const admin = await createUser('admin');
    const patient = await createUser('patient');
    const res = await request(app)
      .delete(`/api/v1/users/${patient.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(204);
  });

  it('patient cannot delete users', async () => {
    const admin = await createUser('admin');
    const patient = await createUser('patient');
    const res = await request(app)
      .delete(`/api/v1/users/${admin.id}`)
      .set('Authorization', `Bearer ${patient.token}`);
    expect(res.status).toBe(403);
  });
});
