import { Request, Response } from 'express';
import { patientsService } from './patients.service';
import { catchAsync } from '../../middleware/catchAsync';
import { AuthenticatedRequest } from '../../types';

export const patientsController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const limit  = Math.min(parseInt(req.query.limit  as string ?? '20', 10), 100);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const { rows, total } = await patientsService.listPatients(limit, offset);
    res.json({ status:'success', data: rows, meta:{ total, limit, offset, pages: Math.ceil(total/limit) } });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const patient = await patientsService.getPatient(req.params.id, user);
    res.json({ status:'success', data: patient });
  }),

  getMe: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const patient = await patientsService.getMyProfile(user.id);
    res.json({ status:'success', data: patient });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const patient = await patientsService.updatePatient(req.params.id, req.body, user);
    res.json({ status:'success', data: patient });
  }),
};
