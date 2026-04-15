import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

interface HealthRecord {
  id: string;
  patient_first_name: string;
  patient_last_name: string;
  doctor_first_name: string;
  doctor_last_name: string;
  diagnosis: string;
  prescription: string | null;
  notes: string | null;
  created_at: string;
}

interface Patient { id: string; first_name: string; last_name: string; }

@Component({
  selector: 'app-health-records',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container" style="padding:2rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
        <h1>Health Records</h1>
        <button *ngIf="auth.userRole === 'doctor'" class="btn btn-primary" (click)="showCreate = !showCreate">
          {{ showCreate ? 'Cancel' : '+ New Record' }}
        </button>
      </div>

      <div class="card" *ngIf="showCreate && auth.userRole === 'doctor'" style="margin-bottom:1.5rem">
        <h3 style="margin-bottom:1rem">Create Health Record</h3>
        <div *ngIf="createError" class="error-message" style="margin-bottom:1rem">{{createError}}</div>
        <div class="form-group">
          <label>Patient</label>
          <select [(ngModel)]="newRecord.patient_id" name="patient_id">
            <option value="">Select patient</option>
            <option *ngFor="let p of patients" [value]="p.id">{{p.first_name}} {{p.last_name}}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Diagnosis</label>
          <textarea [(ngModel)]="newRecord.diagnosis" name="diagnosis" rows="2" required></textarea>
        </div>
        <div class="form-group">
          <label>Prescription</label>
          <textarea [(ngModel)]="newRecord.prescription" name="prescription" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea [(ngModel)]="newRecord.notes" name="notes" rows="2"></textarea>
        </div>
        <button class="btn btn-primary" (click)="createRecord()" [disabled]="!newRecord.patient_id || !newRecord.diagnosis">
          Create Record
        </button>
      </div>

      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Diagnosis</th>
              <th>Prescription</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of records">
              <td>{{ r.created_at | date:'mediumDate' }}</td>
              <td>{{ r.patient_first_name }} {{ r.patient_last_name }}</td>
              <td>Dr. {{ r.doctor_first_name }} {{ r.doctor_last_name }}</td>
              <td>{{ r.diagnosis }}</td>
              <td>{{ r.prescription ?? '—' }}</td>
            </tr>
            <tr *ngIf="records.length === 0">
              <td colspan="5" style="text-align:center;color:#888;padding:2rem">No records found</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class HealthRecordsComponent implements OnInit {
  records: HealthRecord[] = [];
  patients: Patient[] = [];
  showCreate = false;
  newRecord = { patient_id: '', diagnosis: '', prescription: '', notes: '' };
  createError = '';

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.loadRecords();
    if (this.auth.userRole === 'doctor') this.loadPatients();
  }

  loadRecords(): void {
    this.http.get<{ data: HealthRecord[] }>('/api/v1/health-records').subscribe(r => this.records = r.data);
  }

  loadPatients(): void {
    this.http.get<{ data: Patient[] }>('/api/v1/patients').subscribe(r => this.patients = r.data);
  }

  createRecord(): void {
    this.createError = '';
    const payload = {
      patient_id: this.newRecord.patient_id,
      diagnosis: this.newRecord.diagnosis,
      ...(this.newRecord.prescription ? { prescription: this.newRecord.prescription } : {}),
      ...(this.newRecord.notes        ? { notes: this.newRecord.notes } : {}),
    };
    this.http.post<{ data: HealthRecord }>('/api/v1/health-records', payload).subscribe({
      next: () => { this.showCreate = false; this.newRecord = { patient_id:'', diagnosis:'', prescription:'', notes:'' }; this.loadRecords(); },
      error: err => { this.createError = err.error?.message ?? 'Failed to create record'; },
    });
  }
}
