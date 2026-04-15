import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div style="display:flex;justify-content:center;align-items:center;min-height:100vh">
      <div class="card" style="width:100%;max-width:440px">
        <h2 style="margin-bottom:1.5rem">Create Account</h2>
        <div *ngIf="error" class="error-message" style="margin-bottom:1rem;padding:0.75rem;background:#fef2f2;border-radius:6px">{{error}}</div>
        <form (ngSubmit)="onSubmit()">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="form-group">
              <label>First Name</label>
              <input [(ngModel)]="form.first_name" name="first_name" required />
            </div>
            <div class="form-group">
              <label>Last Name</label>
              <input [(ngModel)]="form.last_name" name="last_name" required />
            </div>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" [(ngModel)]="form.email" name="email" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" [(ngModel)]="form.password" name="password" required placeholder="Min 8 chars, uppercase, digit, special" />
          </div>
          <button class="btn btn-primary" type="submit" style="width:100%" [disabled]="loading">
            {{ loading ? 'Creating account...' : 'Register' }}
          </button>
        </form>
        <p style="margin-top:1rem;text-align:center">
          Have an account? <a routerLink="/login">Login</a>
        </p>
      </div>
    </div>
  `,
})
export class RegisterComponent {
  form = { email: '', password: '', first_name: '', last_name: '' };
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit(): void {
    this.loading = true;
    this.error = '';
    this.auth.register(this.form).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.error = err.error?.message ?? 'Registration failed';
        this.loading = false;
      },
    });
  }
}
