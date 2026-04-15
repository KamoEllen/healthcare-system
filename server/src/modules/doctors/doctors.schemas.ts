import { z } from 'zod';

export const CreateDoctorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  specialisation: z.string().min(1).max(100),
  licence_number: z.string().min(1).max(50),
});

export const UpdateDoctorSchema = z.object({
  specialisation: z.string().min(1).max(100).optional(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
});

export type CreateDoctorDto = z.infer<typeof CreateDoctorSchema>;
export type UpdateDoctorDto = z.infer<typeof UpdateDoctorSchema>;
