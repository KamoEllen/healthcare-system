import { Request } from 'express';

export type UserRole = 'admin' | 'doctor' | 'patient';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export interface PaginationQuery {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  status: 'success';
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    pages: number;
  };
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Database row types
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PatientRow {
  id: string;
  user_id: string;
  date_of_birth: Date | null;
  blood_type: string | null;
  emergency_contact: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DoctorRow {
  id: string;
  user_id: string;
  specialisation: string;
  licence_number: string;
  created_at: Date;
  updated_at: Date;
}

export interface AppointmentRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  scheduled_at: Date;
  status: AppointmentStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HealthRecordRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  diagnosis: string;
  prescription: string | null;
  notes: string | null;
  recorded_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  resource_id: string;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
}
