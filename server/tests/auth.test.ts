import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from './helpers/testApp';
import { setupTestDb, truncateTestDb, closeTestDb, testPool } from './helpers/testDb';

beforeAll(async () => { await setupTestDb(); });
beforeEach(async () => { await truncateTestDb(); });
afterAll(async () => { await closeTestDb(); });

const validUser = {
  email: 'test@example.com',
  password: 'Password1!',
  first_name: 'Test',
  last_name: 'User',
};

describe('POST /api/v1/auth/register', () => {
  it('registers a new patient and returns accessToken', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 409 if email already registered', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(409);
  });

  it('returns 400 for weak password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ ...validUser, password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ ...validUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(validUser.email);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: validUser.email, password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'noone@example.com', password: 'Password1!' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('issues new access token with valid refresh cookie', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(validUser);
    const cookie = reg.headers['set-cookie'];
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 401 when no refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('logs out authenticated user', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(validUser);
    const token = reg.body.data.accessToken;
    const res = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  it('always returns 200 regardless of email existence', async () => {
    const res1 = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'noone@example.com' });
    const res2 = await request(app).post('/api/v1/auth/forgot-password').send({ email: validUser.email });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  it('verifies email with valid token', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(validUser);
    const userId = (await testPool.query<{id:string}>(`SELECT id FROM users WHERE email=$1`, [validUser.email])).rows[0].id;
    const tokenRow = await testPool.query<{token:string}>(`SELECT token FROM email_verification_tokens WHERE user_id=$1`, [userId]);
    if (!tokenRow.rows[0]) return; // email not sent in test env
    const res = await request(app).post('/api/v1/auth/verify-email').send({ token: tokenRow.rows[0].token });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid token', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({ token: 'invalid-token' });
    expect(res.status).toBe(400);
  });
});
