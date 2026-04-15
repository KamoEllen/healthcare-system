import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface UserRow { id: string; email: string; role: string; first_name: string; last_name: string; is_active: boolean; created_at: string; }

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container" style="padding:2rem">
      <h1 style="margin-bottom:1.5rem">User Management</h1>
      <div class="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let u of users">
              <td>{{u.first_name}} {{u.last_name}}</td>
              <td>{{u.email}}</td>
              <td><span class="badge badge-confirmed">{{u.role}}</span></td>
              <td>{{ u.is_active ? '✓' : '✗' }}</td>
              <td>{{ u.created_at | date:'mediumDate' }}</td>
              <td>
                <button class="btn btn-danger" style="font-size:0.8rem;padding:0.25rem 0.6rem"
                        (click)="deleteUser(u.id)">Delete</button>
              </td>
            </tr>
            <tr *ngIf="users.length === 0">
              <td colspan="6" style="text-align:center;color:#888;padding:2rem">No users</td>
            </tr>
          </tbody>
        </table>
        <p style="margin-top:1rem;color:#888;font-size:0.85rem">Total: {{meta.total}}</p>
      </div>
    </div>
  `,
})
export class AdminComponent implements OnInit {
  users: UserRow[] = [];
  meta = { total: 0 };

  constructor(private http: HttpClient) {}

  ngOnInit(): void { this.loadUsers(); }

  loadUsers(): void {
    this.http.get<{ data: UserRow[]; meta: { total: number } }>('/api/v1/users').subscribe(r => {
      this.users = r.data;
      this.meta  = r.meta;
    });
  }

  deleteUser(id: string): void {
    if (!confirm('Delete this user?')) return;
    this.http.delete(`/api/v1/users/${id}`).subscribe(() => this.loadUsers());
  }
}
