import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests, please try again later',
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.RATE_LIMIT_API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests, please try again later',
  },
});
