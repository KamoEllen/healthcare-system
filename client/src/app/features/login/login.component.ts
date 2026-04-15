import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div style="display:flex;justify-content:center;align-items:center;min-height:100vh">
      <div class="card" style="width:100%;max-width:400px">
        <h2 style="margin-bottom:1.5rem">Healthcare Login</h2>
        <div *ngIf="error" class="error-message" style="margin-bottom:1rem;padding:0.75rem;background:#fef2f2;border-radius:6px">{{error}}</div>
        <form (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label>Email</label>
            <input type="email" [(ngModel)]="email" name="email" required placeholder="you@example.com" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" [(ngModel)]="password" name="password" required />
          </div>
          <button class="btn btn-primary" type="submit" style="width:100%" [disabled]="loading">
            {{ loading ? 'Logging in...' : 'Login' }}
          </button>
        </form>
        <p style="margin-top:1rem;text-align:center">
          No account? <a routerLink="/register">Register</a>
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit(): void {
    this.loading = true;
    this.error = '';
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.error = err.error?.message ?? 'Login failed';
        this.loading = false;
      },
    });
  }
}
