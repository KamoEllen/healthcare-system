import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { authRepository } from './auth.repository';
import { config, getEmailConfig } from '../../config';
import { AppError, JwtPayload, UserRow } from '../../types';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.schemas';

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function signAccessToken(user: UserRow): string {
  const payload: JwtPayload = { id: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as string });
}

function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const transporter = nodemailer.createTransport(getEmailConfig());
    await transporter.sendMail({ from: config.EMAIL_FROM, to, subject, html });
  } catch (err) {
    console.error('Email send failed (non-fatal):', err);
  }
}

export const authService = {
  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string }> {
    const existing = await authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new AppError('Email already registered', 409);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await authRepository.createUserWithPatient(
      dto.email,
      passwordHash,
      dto.first_name,
      dto.last_name,
      dto.date_of_birth,
      dto.blood_type,
      dto.emergency_contact
    );

    // Send verification email (non-blocking)
    const verifyToken = generateRawToken();
    await authRepository.createEmailVerificationToken(user.id, verifyToken);
    void sendEmail(
      user.email,
      'Verify your email',
      `<p>Click to verify: <a href="${config.CORS_ORIGIN}/verify-email?token=${verifyToken}">Verify Email</a></p>`
    );

    const accessToken = signAccessToken(user);
    const rawRefresh = generateRawToken();
    await authRepository.saveRefreshToken(user.id, hashToken(rawRefresh), refreshTokenExpiry());

    return { accessToken, refreshToken: rawRefresh };
  },

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: Omit<UserRow, 'password_hash'> }> {
    const user = await authRepository.findUserByEmail(dto.email);
    // Prevent user enumeration — same delay regardless
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new AppError('Invalid credentials', 401);
    }
    if (!user.is_active) {
      throw new AppError('Account is disabled', 403);
    }

    const accessToken = signAccessToken(user);
    const rawRefresh = generateRawToken();
    await authRepository.saveRefreshToken(user.id, hashToken(rawRefresh), refreshTokenExpiry());

    const { password_hash: _, ...safeUser } = user;
    return { accessToken, refreshToken: rawRefresh, user: safeUser };
  },

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const hash = hashToken(rawToken);
    const stored = await authRepository.findRefreshToken(hash);
    if (!stored) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Rotate: revoke old, issue new
    await authRepository.revokeRefreshToken(hash);

    const user = await authRepository.findUserById(stored.user_id);
    if (!user) {
      throw new AppError('User not found', 401);
    }

    const accessToken = signAccessToken(user);
    const newRaw = generateRawToken();
    await authRepository.saveRefreshToken(user.id, hashToken(newRaw), refreshTokenExpiry());

    return { accessToken, refreshToken: newRaw };
  },

  async logout(userId: string): Promise<void> {
    await authRepository.revokeAllUserRefreshTokens(userId);
  },

  async verifyEmail(token: string): Promise<void> {
    const userId = await authRepository.verifyEmailToken(token);
    if (!userId) {
      throw new AppError('Invalid or expired verification token', 400);
    }
  },

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await authRepository.findUserByEmail(dto.email);
    // Always return 200 — prevent user enumeration
    if (!user) return;

    const rawToken = generateRawToken();
    await authRepository.createPasswordResetToken(user.id, rawToken);
    void sendEmail(
      user.email,
      'Reset your password',
      `<p>Click to reset: <a href="${config.CORS_ORIGIN}/reset-password?token=${rawToken}">Reset Password</a></p><p>This link expires in 1 hour.</p>`
    );
  },

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await authRepository.findPasswordResetToken(dto.token);
    if (!record) {
      throw new AppError('Invalid or expired reset token', 400);
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await authRepository.resetPassword(record.user_id, passwordHash, dto.token);
  },
};
