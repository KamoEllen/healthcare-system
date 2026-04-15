import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login',    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/register/register.component').then(m => m.RegisterComponent) },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'appointments',
    canActivate: [authGuard],
    loadComponent: () => import('./features/appointments/appointments.component').then(m => m.AppointmentsComponent),
  },
  {
    path: 'health-records',
    canActivate: [authGuard],
    loadComponent: () => import('./features/health-records/health-records.component').then(m => m.HealthRecordsComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
