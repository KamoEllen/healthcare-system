import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError, JwtPayload, AuthenticatedRequest } from '../types';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired', 401));
    }
    return next(new AppError('Invalid token', 401));
  }
}
