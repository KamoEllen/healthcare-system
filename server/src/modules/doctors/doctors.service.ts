import bcrypt from 'bcryptjs';
import { doctorsRepository } from './doctors.repository';
import { AppError, AuthenticatedRequest } from '../../types';
import { CreateDoctorDto, UpdateDoctorDto } from './doctors.schemas';

export const doctorsService = {
  async listDoctors(limit = 20, offset = 0) {
    return doctorsRepository.findAll(limit, offset);
  },

  async getDoctor(id: string) {
    const doctor = await doctorsRepository.findById(id);
    if (!doctor) throw new AppError('Doctor not found', 404);
    return doctor;
  },

  async getMyProfile(userId: string) {
    const doctor = await doctorsRepository.findByUserId(userId);
    if (!doctor) throw new AppError('Doctor profile not found', 404);
    return doctor;
  },

  async createDoctor(dto: CreateDoctorDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return doctorsRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.first_name,
      lastName: dto.last_name,
      specialisation: dto.specialisation,
      licenceNumber: dto.licence_number,
    });
  },

  async updateDoctor(id: string, dto: UpdateDoctorDto, requester: AuthenticatedRequest['user']) {
    const doctor = await doctorsRepository.findById(id);
    if (!doctor) throw new AppError('Doctor not found', 404);
    if (requester.role === 'doctor' && doctor.user_id !== requester.id) {
      throw new AppError('Insufficient permissions', 403);
    }
    return doctorsRepository.update(id, dto);
  },
};
