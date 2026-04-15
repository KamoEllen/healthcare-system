import { usersRepository } from './users.repository';
import { AppError } from '../../types';
import { UpdateUserDto } from './users.schemas';

export const usersService = {
  async listUsers(limit = 20, offset = 0) {
    return usersRepository.findAll(limit, offset);
  },

  async getUser(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await usersRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return usersRepository.update(id, dto);
  },

  async deleteUser(id: string) {
    const deleted = await usersRepository.softDelete(id);
    if (!deleted) throw new AppError('User not found', 404);
  },
};
