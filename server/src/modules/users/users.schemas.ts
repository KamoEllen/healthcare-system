import { z } from 'zod';

export const UpdateUserSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
