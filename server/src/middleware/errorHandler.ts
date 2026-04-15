import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // PostgreSQL unique violation
  if ((err as NodeJS.ErrnoException).code === '23505') {
    res.status(409).json({
      status: 'error',
      message: 'Resource already exists',
    });
    return;
  }

  console.error('Unhandled error:', err);

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
}
