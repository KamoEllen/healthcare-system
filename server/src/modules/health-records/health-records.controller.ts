import { Request, Response } from 'express';
import { healthRecordsService } from './health-records.service';
import { catchAsync } from '../../middleware/catchAsync';
import { AuthenticatedRequest } from '../../types';

export const healthRecordsController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const user   = (req as AuthenticatedRequest).user;
    const limit  = Math.min(parseInt(req.query.limit  as string ?? '20', 10), 100);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const { rows, total } = await healthRecordsService.listRecords(user, limit, offset);
    res.json({ status:'success', data:rows, meta:{ total, limit, offset, pages: Math.ceil(total/limit) } });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const user   = (req as AuthenticatedRequest).user;
    const record = await healthRecordsService.getRecord(req.params.id, user);
    res.json({ status:'success', data: record });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const user   = (req as AuthenticatedRequest).user;
    const record = await healthRecordsService.createRecord(req.body, user);
    res.status(201).json({ status:'success', data: record });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const user   = (req as AuthenticatedRequest).user;
    const record = await healthRecordsService.updateRecord(req.params.id, req.body, user);
    res.json({ status:'success', data: record });
  }),
};
