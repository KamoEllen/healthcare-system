import { Router } from 'express';
import { appointmentsController } from './appointments.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { CreateAppointmentSchema, UpdateAppointmentStatusSchema } from './appointments.schemas';

export const appointmentsRouter = Router();

appointmentsRouter.use(authenticate);

appointmentsRouter.get('/',    authorize('admin','doctor','patient'),                              appointmentsController.list);
appointmentsRouter.get('/:id', authorize('admin','doctor','patient'),                              appointmentsController.getOne);
appointmentsRouter.post('/',   authorize('patient','admin'), validate(CreateAppointmentSchema),    appointmentsController.book);
appointmentsRouter.patch('/:id/status', authorize('doctor','admin'), validate(UpdateAppointmentStatusSchema), appointmentsController.updateStatus);
appointmentsRouter.delete('/:id', authorize('patient','admin'),                                    appointmentsController.cancel);
