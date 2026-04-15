export type UserRole = 'admin' | 'doctor' | 'patient';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface LoginResponse {
  status: string;
  data: {
    accessToken: string;
    user: User;
  };
}

export interface TokenResponse {
  status: string;
  data: { accessToken: string };
}
