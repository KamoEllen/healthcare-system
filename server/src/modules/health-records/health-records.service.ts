import { healthRecordsRepository } from './health-records.repository';
import { patientsRepository } from '../patients/patients.repository';
import { doctorsRepository } from '../doctors/doctors.repository';
import { AppError, AuthenticatedRequest } from '../../types';
import { CreateHealthRecordDto, UpdateHealthRecordDto } from './health-records.schemas';

const EDIT_WINDOW_HOURS = 24;

export const healthRecordsService = {
  async listRecords(requester: AuthenticatedRequest['user'], limit = 20, offset = 0) {
    let filter: { patientId?: string; doctorId?: string } = {};

    if (requester.role === 'patient') {
      const patient = await patientsRepository.findByUserId(requester.id);
      if (!patient) throw new AppError('Patient profile not found', 404);
      filter.patientId = patient.id;
    } else if (requester.role === 'doctor') {
      const doctor = await doctorsRepository.findByUserId(requester.id);
      if (!doctor) throw new AppError('Doctor profile not found', 404);
      filter.doctorId = doctor.id;
    }

    return healthRecordsRepository.findAll(filter, limit, offset);
  },

  async getRecord(id: string, requester: AuthenticatedRequest['user']) {
    const record = await healthRecordsRepository.findById(id);
    if (!record) throw new AppError('Health record not found', 404);

    if (requester.role === 'patient') {
      const patient = await patientsRepository.findByUserId(requester.id);
      if (!patient || record.patient_id !== patient.id) throw new AppError('Insufficient permissions', 403);
    } else if (requester.role === 'doctor') {
      const doctor = await doctorsRepository.findByUserId(requester.id);
      if (!doctor || record.doctor_id !== doctor.id) throw new AppError('Insufficient permissions', 403);
    }
    return record;
  },

  async createRecord(dto: CreateHealthRecordDto, requester: AuthenticatedRequest['user']) {
    const doctor = await doctorsRepository.findByUserId(requester.id);
    if (!doctor) throw new AppError('Doctor profile not found', 404);

    const patient = await patientsRepository.findById(dto.patient_id);
    if (!patient) throw new AppError('Patient not found', 404);

    return healthRecordsRepository.create(
      patient.id, doctor.id, requester.id,
      dto.diagnosis, dto.prescription, dto.notes
    );
  },

  async updateRecord(id: string, dto: UpdateHealthRecordDto, requester: AuthenticatedRequest['user']) {
    const record = await healthRecordsRepository.findById(id);
    if (!record) throw new AppError('Health record not found', 404);

    const doctor = await doctorsRepository.findByUserId(requester.id);
    if (!doctor || record.doctor_id !== doctor.id) {
      throw new AppError('Insufficient permissions', 403);
    }

    const ageHours = (Date.now() - new Date(record.created_at).getTime()) / 3_600_000;
    if (ageHours > EDIT_WINDOW_HOURS) {
      throw new AppError('Health records can only be edited within 24 hours of creation', 403);
    }

    return healthRecordsRepository.update(id, dto);
  },
};
