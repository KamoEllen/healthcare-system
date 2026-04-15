import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envFile =
  process.env.NODE_ENV === 'test'
    ? path.resolve(__dirname, '../.env.test')
    : path.resolve(__dirname, '../.env');

dotenv.config({ path: envFile });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  EMAIL_PROVIDER: z.enum(['mailtrap', 'resend', 'ses']).default('mailtrap'),
  EMAIL_USER: z.string().optional().default(''),
  EMAIL_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().email().default('noreply@healthcare.dev'),
  AWS_REGION: z.string().optional().default('us-east-1'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
  RATE_LIMIT_API_MAX: z.coerce.number().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export function getEmailConfig(): {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
} {
  switch (config.EMAIL_PROVIDER) {
    case 'resend':
      return {
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: config.EMAIL_PASS ?? '' },
      };
    case 'ses':
      return {
        host: `email-smtp.${config.AWS_REGION}.amazonaws.com`,
        port: 587,
        secure: false,
        auth: { user: config.EMAIL_USER ?? '', pass: config.EMAIL_PASS ?? '' },
      };
    case 'mailtrap':
    default:
      return {
        host: 'sandbox.smtp.mailtrap.io',
        port: 2525,
        secure: false,
        auth: { user: config.EMAIL_USER ?? '', pass: config.EMAIL_PASS ?? '' },
      };
  }
}
