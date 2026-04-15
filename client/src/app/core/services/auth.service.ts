import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { User, LoginResponse } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = '/api/v1/auth';

  private _accessToken = '';
  readonly currentUser = signal<User | null>(null);

  constructor(private http: HttpClient, private router: Router) {}

  get accessToken(): string { return this._accessToken; }
  get isLoggedIn(): boolean { return !!this._accessToken; }
  get userRole(): string    { return this.currentUser()?.role ?? ''; }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/login`, { email, password }, { withCredentials: true }).pipe(
      tap(res => {
        this._accessToken = res.data.accessToken;
        this.currentUser.set(res.data.user);
      })
    );
  }

  register(data: Record<string, unknown>): Observable<{ status: string; data: { accessToken: string } }> {
    return this.http.post<{ status: string; data: { accessToken: string } }>(`${this.API}/register`, data, { withCredentials: true }).pipe(
      tap(res => { this._accessToken = res.data.accessToken; })
    );
  }

  logout(): void {
    this.http.post(`${this.API}/logout`, {}, { withCredentials: true }).subscribe();
    this._accessToken = '';
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  refreshToken(): Observable<{ status: string; data: { accessToken: string } }> {
    return this.http.post<{ status: string; data: { accessToken: string } }>(`${this.API}/refresh`, {}, { withCredentials: true }).pipe(
      tap(res => { this._accessToken = res.data.accessToken; }),
      catchError(err => {
        this.logout();
        return throwError(() => err);
      })
    );
  }
}
