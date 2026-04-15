import { Request, Response } from 'express';
import { usersService } from './users.service';
import { catchAsync } from '../../middleware/catchAsync';

export const usersController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const limit  = Math.min(parseInt(req.query.limit  as string ?? '20', 10), 100);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const { rows, total } = await usersService.listUsers(limit, offset);
    res.json({
      status: 'success',
      data: rows,
      meta: { total, limit, offset, pages: Math.ceil(total / limit) },
    });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const user = await usersService.getUser(req.params.id);
    res.json({ status: 'success', data: user });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const user = await usersService.updateUser(req.params.id, req.body);
    res.json({ status: 'success', data: user });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await usersService.deleteUser(req.params.id);
    res.status(204).send();
  }),
};
