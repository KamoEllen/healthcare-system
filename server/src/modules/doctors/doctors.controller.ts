import { Request, Response } from 'express';
import { doctorsService } from './doctors.service';
import { catchAsync } from '../../middleware/catchAsync';
import { AuthenticatedRequest } from '../../types';

export const doctorsController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const limit  = Math.min(parseInt(req.query.limit  as string ?? '20', 10), 100);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const { rows, total } = await doctorsService.listDoctors(limit, offset);
    res.json({ status:'success', data:rows, meta:{ total, limit, offset, pages: Math.ceil(total/limit) } });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const doctor = await doctorsService.getDoctor(req.params.id);
    res.json({ status:'success', data: doctor });
  }),

  getMe: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const doctor = await doctorsService.getMyProfile(user.id);
    res.json({ status:'success', data: doctor });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const doctor = await doctorsService.createDoctor(req.body);
    res.status(201).json({ status:'success', data: doctor });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const doctor = await doctorsService.updateDoctor(req.params.id, req.body, user);
    res.json({ status:'success', data: doctor });
  }),
};
