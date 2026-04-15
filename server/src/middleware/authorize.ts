import { Request, Response, NextFunction } from 'express';
import { AppError, AuthenticatedRequest, UserRole } from '../types';

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return next(new AppError('Authentication required', 401));
    }
    if (!roles.includes(user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}
