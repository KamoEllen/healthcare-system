import { Router } from 'express';
import { healthRecordsController } from './health-records.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { CreateHealthRecordSchema, UpdateHealthRecordSchema } from './health-records.schemas';

export const healthRecordsRouter = Router();

healthRecordsRouter.use(authenticate);

healthRecordsRouter.get('/',    authorize('admin','doctor','patient'),                                    healthRecordsController.list);
healthRecordsRouter.get('/:id', authorize('admin','doctor','patient'),                                    healthRecordsController.getOne);
healthRecordsRouter.post('/',   authorize('doctor'), validate(CreateHealthRecordSchema),                  healthRecordsController.create);
healthRecordsRouter.patch('/:id', authorize('doctor'), validate(UpdateHealthRecordSchema),               healthRecordsController.update);
