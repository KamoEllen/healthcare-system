import { z } from 'zod';

export const UpdatePatientSchema = z.object({
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  blood_type: z.enum(['A+','A-','B+','B-','AB+','AB-','O+','O-']).optional(),
  emergency_contact: z.string().max(255).optional(),
});

export type UpdatePatientDto = z.infer<typeof UpdatePatientSchema>;
