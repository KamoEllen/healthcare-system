import { Request, Response, NextFunction } from 'express';
import { AppError, AuthenticatedRequest } from '../types';

export function isOwner(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    return next(new AppError('Authentication required', 401));
  }
  if (user.role === 'admin') {
    return next();
  }
  if (req.params.id !== user.id) {
    return next(new AppError('Insufficient permissions', 403));
  }
  next();
}
