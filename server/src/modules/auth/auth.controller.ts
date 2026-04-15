import { Request, Response } from 'express';
import { authService } from './auth.service';
import { catchAsync } from '../../middleware/catchAsync';
import { AuthenticatedRequest } from '../../types';

const COOKIE_NAME = 'refreshToken';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const authController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const { accessToken, refreshToken } = await authService.register(req.body);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    res.status(201).json({ status: 'success', data: { accessToken } });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const { accessToken, refreshToken, user } = await authService.login(req.body);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    res.json({ status: 'success', data: { accessToken, user } });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const rawToken = req.cookies[COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      res.status(401).json({ status: 'error', message: 'Refresh token required' });
      return;
    }
    const { accessToken, refreshToken } = await authService.refresh(rawToken);
    res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
    res.json({ status: 'success', data: { accessToken } });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    await authService.logout(user.id);
    res.clearCookie(COOKIE_NAME);
    res.json({ status: 'success', message: 'Logged out' });
  }),

  verifyEmail: catchAsync(async (req: Request, res: Response) => {
    await authService.verifyEmail(req.body.token as string);
    res.json({ status: 'success', message: 'Email verified' });
  }),

  forgotPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body);
    res.json({ status: 'success', message: 'If that email exists, a reset link has been sent' });
  }),

  resetPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body);
    res.json({ status: 'success', message: 'Password reset successfully' });
  }),
};
