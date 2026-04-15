import { Request, Response } from 'express';
import { appointmentsService } from './appointments.service';
import { catchAsync } from '../../middleware/catchAsync';
import { AuthenticatedRequest } from '../../types';

export const appointmentsController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const user   = (req as AuthenticatedRequest).user;
    const limit  = Math.min(parseInt(req.query.limit  as string ?? '20', 10), 100);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const { rows, total } = await appointmentsService.listAppointments(user, limit, offset);
    res.json({ status:'success', data:rows, meta:{ total, limit, offset, pages: Math.ceil(total/limit) } });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const appt = await appointmentsService.getAppointment(req.params.id, user);
    res.json({ status:'success', data: appt });
  }),

  book: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const appt = await appointmentsService.bookAppointment(req.body, user);
    res.status(201).json({ status:'success', data: appt });
  }),

  updateStatus: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const appt = await appointmentsService.updateStatus(req.params.id, req.body, user);
    res.json({ status:'success', data: appt });
  }),

  cancel: catchAsync(async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const appt = await appointmentsService.cancelAppointment(req.params.id, user);
    res.json({ status:'success', data: appt });
  }),
};
