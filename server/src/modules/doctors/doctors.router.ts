import { Router } from 'express';
import { doctorsController } from './doctors.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { CreateDoctorSchema, UpdateDoctorSchema } from './doctors.schemas';

export const doctorsRouter = Router();

doctorsRouter.use(authenticate);

doctorsRouter.get('/',        authorize('admin','doctor','patient'),         doctorsController.list);
doctorsRouter.get('/me',      authorize('doctor'),                           doctorsController.getMe);
doctorsRouter.get('/:id',     authorize('admin','doctor','patient'),         doctorsController.getOne);
doctorsRouter.post('/',       authorize('admin'), validate(CreateDoctorSchema), doctorsController.create);
doctorsRouter.patch('/:id',   authorize('admin','doctor'), validate(UpdateDoctorSchema), doctorsController.update);
