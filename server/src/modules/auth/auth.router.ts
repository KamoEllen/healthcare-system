import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rateLimiter';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from './auth.schemas';

export const authRouter = Router();

authRouter.post('/register',      authRateLimiter, validate(RegisterSchema),       authController.register);
authRouter.post('/login',         authRateLimiter, validate(LoginSchema),           authController.login);
authRouter.post('/refresh',                                                          authController.refresh);
authRouter.post('/logout',        authenticate,                                      authController.logout);
authRouter.post('/verify-email',  validate(VerifyEmailSchema),                      authController.verifyEmail);
authRouter.post('/forgot-password', authRateLimiter, validate(ForgotPasswordSchema), authController.forgotPassword);
authRouter.post('/reset-password',  authRateLimiter, validate(ResetPasswordSchema),  authController.resetPassword);
