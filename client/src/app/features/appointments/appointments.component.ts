import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

interface Appointment {
  id: string;
  doctor_first_name: string;
  doctor_last_name: string;
  doctor_specialisation: string;
  patient_first_name: string;
  patient_last_name: string;
  scheduled_at: string;
  status: 'pending'|'confirmed'|'cancelled'|'completed';
  notes: string | null;
}

interface Doctor { id: string; first_name: string; last_name: string; specialisation: string; }

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container" style="padding:2rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
        <h1>Appointments</h1>
        <button *ngIf="auth.userRole === 'patient'" class="btn btn-primary" (click)="showBooking = !showBooking">
          {{ showBooking ? 'Cancel' : '+ Book Appointment' }}
        </button>
      </div>

      <div class="card" *ngIf="showBooking && auth.userRole === 'patient'" style="margin-bottom:1.5rem">
        <h3 style="margin-bottom:1rem">Book Appointment</h3>
        <div *ngIf="bookError" class="error-message" style="margin-bottom:1rem">{{bookError}}</div>
        <div class="form-group">
          <label>Doctor</label>
          <select [(ngModel)]="booking.doctor_id" name="doctor_id">
            <option value="">Select a doctor</option>
            <option *ngFor="let d of doctors" [value]="d.id">Dr. {{d.first_name}} {{d.last_name}} — {{d.specialisation}}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date & Time</label>
          <input type="datetime-local" [(ngModel)]="booking.scheduled_at" name="scheduled_at" />
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea [(ngModel)]="booking.notes" name="notes" rows="2"></textarea>
        </div>
        <button class="btn btn-primary" (click)="bookAppointment()" [disabled]="!booking.doctor_id || !booking.scheduled_at">
          Confirm Booking
        </button>
      </div>

      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>{{ auth.userRole === 'patient' ? 'Doctor' : 'Patient' }}</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let a of appointments">
              <td>{{ a.scheduled_at | date:'medium' }}</td>
              <td *ngIf="auth.userRole === 'patient'">Dr. {{a.doctor_first_name}} {{a.doctor_last_name}}</td>
              <td *ngIf="auth.userRole !== 'patient'">{{a.patient_first_name}} {{a.patient_last_name}}</td>
              <td><span class="badge badge-{{a.status}}">{{a.status}}</span></td>
              <td>{{ a.notes ?? '—' }}</td>
              <td>
                <button *ngIf="auth.userRole === 'doctor' && a.status === 'pending'"
                        class="btn btn-primary" style="font-size:0.8rem;padding:0.25rem 0.6rem;margin-right:0.25rem"
                        (click)="updateStatus(a.id, 'confirmed')">Confirm</button>
                <button *ngIf="auth.userRole === 'doctor' && a.status === 'confirmed'"
                        class="btn btn-primary" style="font-size:0.8rem;padding:0.25rem 0.6rem;margin-right:0.25rem"
                        (click)="updateStatus(a.id, 'completed')">Complete</button>
                <button *ngIf="auth.userRole === 'patient' && a.status === 'pending'"
                        class="btn btn-danger" style="font-size:0.8rem;padding:0.25rem 0.6rem"
                        (click)="cancel(a.id)">Cancel</button>
              </td>
            </tr>
            <tr *ngIf="appointments.length === 0">
              <td colspan="5" style="text-align:center;color:#888;padding:2rem">No appointments found</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AppointmentsComponent implements OnInit {
  appointments: Appointment[] = [];
  doctors: Doctor[] = [];
  showBooking = false;
  booking = { doctor_id: '', scheduled_at: '', notes: '' };
  bookError = '';

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAppointments();
    if (this.auth.userRole === 'patient') this.loadDoctors();
  }

  loadAppointments(): void {
    this.http.get<{ data: Appointment[] }>('/api/v1/appointments').subscribe(r => this.appointments = r.data);
  }

  loadDoctors(): void {
    this.http.get<{ data: Doctor[] }>('/api/v1/doctors').subscribe(r => this.doctors = r.data);
  }

  bookAppointment(): void {
    this.bookError = '';
    const payload = {
      doctor_id: this.booking.doctor_id,
      scheduled_at: new Date(this.booking.scheduled_at).toISOString(),
      ...(this.booking.notes ? { notes: this.booking.notes } : {}),
    };
    this.http.post<{ data: Appointment }>('/api/v1/appointments', payload).subscribe({
      next: () => { this.showBooking = false; this.booking = { doctor_id: '', scheduled_at: '', notes: '' }; this.loadAppointments(); },
      error: err => { this.bookError = err.error?.message ?? 'Booking failed'; },
    });
  }

  updateStatus(id: string, status: string): void {
    this.http.patch(`/api/v1/appointments/${id}/status`, { status }).subscribe(() => this.loadAppointments());
  }

  cancel(id: string): void {
    this.http.delete(`/api/v1/appointments/${id}`).subscribe(() => this.loadAppointments());
  }
}
