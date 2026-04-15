import { patientsRepository } from './patients.repository';
import { AppError, AuthenticatedRequest } from '../../types';
import { UpdatePatientDto } from './patients.schemas';

export const patientsService = {
  async listPatients(limit = 20, offset = 0) {
    return patientsRepository.findAll(limit, offset);
  },

  async getPatient(id: string, requester: AuthenticatedRequest['user']) {
    const patient = await patientsRepository.findById(id);
    if (!patient) throw new AppError('Patient not found', 404);
    if (requester.role === 'patient' && patient.user_id !== requester.id) {
      throw new AppError('Insufficient permissions', 403);
    }
    return patient;
  },

  async getMyProfile(userId: string) {
    const patient = await patientsRepository.findByUserId(userId);
    if (!patient) throw new AppError('Patient profile not found', 404);
    return patient;
  },

  async updatePatient(id: string, dto: UpdatePatientDto, requester: AuthenticatedRequest['user']) {
    const patient = await patientsRepository.findById(id);
    if (!patient) throw new AppError('Patient not found', 404);
    if (requester.role === 'patient' && patient.user_id !== requester.id) {
      throw new AppError('Insufficient permissions', 403);
    }
    return patientsRepository.update(id, dto);
  },
};
