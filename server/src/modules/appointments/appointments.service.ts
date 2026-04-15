import { appointmentsRepository } from './appointments.repository';
import { patientsRepository } from '../patients/patients.repository';
import { doctorsRepository } from '../doctors/doctors.repository';
import { AppError, AuthenticatedRequest, AppointmentStatus } from '../../types';
import { CreateAppointmentDto, UpdateAppointmentStatusDto } from './appointments.schemas';

export const appointmentsService = {
  async listAppointments(requester: AuthenticatedRequest['user'], limit = 20, offset = 0) {
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

    return appointmentsRepository.findAll(filter, limit, offset);
  },

  async getAppointment(id: string, requester: AuthenticatedRequest['user']) {
    const appt = await appointmentsRepository.findById(id);
    if (!appt) throw new AppError('Appointment not found', 404);

    if (requester.role === 'patient') {
      const patient = await patientsRepository.findByUserId(requester.id);
      if (!patient || appt.patient_id !== patient.id) throw new AppError('Insufficient permissions', 403);
    } else if (requester.role === 'doctor') {
      const doctor = await doctorsRepository.findByUserId(requester.id);
      if (!doctor || appt.doctor_id !== doctor.id) throw new AppError('Insufficient permissions', 403);
    }
    return appt;
  },

  async bookAppointment(dto: CreateAppointmentDto, requester: AuthenticatedRequest['user']) {
    const patient = await patientsRepository.findByUserId(requester.id);
    if (!patient) throw new AppError('Patient profile not found', 404);

    const doctor = await doctorsRepository.findById(dto.doctor_id);
    if (!doctor) throw new AppError('Doctor not found', 404);

    const slotTaken = await appointmentsRepository.isSlotTaken(dto.doctor_id, dto.scheduled_at);
    if (slotTaken) throw new AppError('This time slot is already booked', 409);

    return appointmentsRepository.create(patient.id, dto.doctor_id, dto.scheduled_at, dto.notes);
  },

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto, requester: AuthenticatedRequest['user']) {
    const appt = await appointmentsRepository.findById(id);
    if (!appt) throw new AppError('Appointment not found', 404);

    if (requester.role === 'doctor') {
      const doctor = await doctorsRepository.findByUserId(requester.id);
      if (!doctor || appt.doctor_id !== doctor.id) throw new AppError('Insufficient permissions', 403);
      if (!['confirmed', 'completed'].includes(dto.status)) {
        throw new AppError('Doctors can only confirm or complete appointments', 400);
      }
    }

    if (appt.status === 'cancelled') throw new AppError('Cannot update a cancelled appointment', 409);
    if (appt.status === 'completed') throw new AppError('Cannot update a completed appointment', 409);

    return appointmentsRepository.updateStatus(id, dto.status as AppointmentStatus, requester.id);
  },

  async cancelAppointment(id: string, requester: AuthenticatedRequest['user']) {
    const appt = await appointmentsRepository.findById(id);
    if (!appt) throw new AppError('Appointment not found', 404);

    if (requester.role === 'patient') {
      const patient = await patientsRepository.findByUserId(requester.id);
      if (!patient || appt.patient_id !== patient.id) throw new AppError('Insufficient permissions', 403);
      if (appt.status !== 'pending') throw new AppError('Patients can only cancel pending appointments', 409);
    }

    return appointmentsRepository.updateStatus(id, 'cancelled', requester.id);
  },
};
