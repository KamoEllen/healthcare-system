import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  doctor_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  notes: z.string().max(1000).optional(),
});

export const UpdateAppointmentStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled']),
});

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentStatusDto = z.infer<typeof UpdateAppointmentStatusSchema>;
