import { z } from 'zod';

export const CreateHealthRecordSchema = z.object({
  patient_id: z.string().uuid(),
  diagnosis: z.string().min(1),
  prescription: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateHealthRecordSchema = z.object({
  diagnosis: z.string().min(1).optional(),
  prescription: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateHealthRecordDto = z.infer<typeof CreateHealthRecordSchema>;
export type UpdateHealthRecordDto = z.infer<typeof UpdateHealthRecordSchema>;
