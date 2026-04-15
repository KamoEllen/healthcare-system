import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <nav *ngIf="auth.isLoggedIn">
      <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
      <a routerLink="/appointments" routerLinkActive="active">Appointments</a>
      <a routerLink="/health-records" routerLinkActive="active">Health Records</a>
      <a *ngIf="auth.userRole === 'admin'" routerLink="/admin" routerLinkActive="active">Admin</a>
      <span class="spacer"></span>
      <span style="color:#ccd6f6">{{ auth.currentUser()?.first_name }}</span>
      <button class="btn btn-danger" style="font-size:0.85rem;padding:0.3rem 0.8rem" (click)="auth.logout()">Logout</button>
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  constructor(public auth: AuthService) {}
}
