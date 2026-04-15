import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="container" style="padding:2rem">
      <h1>Welcome, {{ auth.currentUser()?.first_name }}</h1>
      <p style="color:#666;margin-bottom:2rem">Role: <strong>{{ auth.userRole }}</strong></p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.5rem">
        <div class="card" style="text-align:center">
          <div style="font-size:2rem;margin-bottom:0.5rem">📅</div>
          <h3>{{ stats.appointments }}</h3>
          <p>Appointments</p>
          <a routerLink="/appointments" class="btn btn-primary" style="margin-top:1rem;display:inline-block">View</a>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-size:2rem;margin-bottom:0.5rem">🩺</div>
          <h3>{{ stats.records }}</h3>
          <p>Health Records</p>
          <a routerLink="/health-records" class="btn btn-primary" style="margin-top:1rem;display:inline-block">View</a>
        </div>
        <div class="card" *ngIf="auth.userRole === 'admin'" style="text-align:center">
          <div style="font-size:2rem;margin-bottom:0.5rem">⚙️</div>
          <h3>Admin</h3>
          <p>User management</p>
          <a routerLink="/admin" class="btn btn-primary" style="margin-top:1rem;display:inline-block">Manage</a>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  stats = { appointments: 0, records: 0 };

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<{ data: unknown[]; meta: { total: number } }>('/api/v1/appointments').subscribe(r => this.stats.appointments = r.meta.total);
    this.http.get<{ data: unknown[]; meta: { total: number } }>('/api/v1/health-records').subscribe(r => this.stats.records = r.meta.total);
  }
}
