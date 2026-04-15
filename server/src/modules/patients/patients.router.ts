import { Router } from 'express';
import { patientsController } from './patients.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { UpdatePatientSchema } from './patients.schemas';

export const patientsRouter = Router();

patientsRouter.use(authenticate);

patientsRouter.get('/',        authorize('admin','doctor'),                   patientsController.list);
patientsRouter.get('/me',      authorize('patient'),                          patientsController.getMe);
patientsRouter.get('/:id',     authorize('admin','doctor','patient'),         patientsController.getOne);
patientsRouter.patch('/:id',   authorize('admin','patient'), validate(UpdatePatientSchema), patientsController.update);
