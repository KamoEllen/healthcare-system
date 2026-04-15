import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';
import { checkConnection } from './database';

import { authRouter } from './modules/auth/auth.router';
import { usersRouter } from './modules/users/users.router';
import { patientsRouter } from './modules/patients/patients.router';
import { doctorsRouter } from './modules/doctors/doctors.router';
import { appointmentsRouter } from './modules/appointments/appointments.router';
import { healthRecordsRouter } from './modules/health-records/health-records.router';

const app = express();

// Security headers — first middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging (skip in test)
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check (no auth, no rate limit)
app.get('/api/v1/health', async (_req, res) => {
  const dbOk = await checkConnection();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'disconnected',
    env: config.NODE_ENV,
  });
});

// API routes
app.use('/api/v1', apiRateLimiter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/patients', patientsRouter);
app.use('/api/v1/doctors', doctorsRouter);
app.use('/api/v1/appointments', appointmentsRouter);
app.use('/api/v1/health-records', healthRecordsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global error handler — must have 4 params
app.use(errorHandler);

export default app;
