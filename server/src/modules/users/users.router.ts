import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { isOwner } from '../../middleware/isOwner';
import { validate } from '../../middleware/validate';
import { UpdateUserSchema } from './users.schemas';

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get('/',     authorize('admin'),                              usersController.list);
usersRouter.get('/:id',  authorize('admin', 'doctor', 'patient'),        usersController.getOne);
usersRouter.patch('/:id', isOwner, validate(UpdateUserSchema),           usersController.update);
usersRouter.delete('/:id', authorize('admin'),                           usersController.remove);
