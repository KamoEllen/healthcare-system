import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);

  const addToken = (request: HttpRequest<unknown>) =>
    authService.accessToken
      ? request.clone({ setHeaders: { Authorization: `Bearer ${authService.accessToken}` } })
      : request;

  return next(addToken(req)).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/')) {
        return authService.refreshToken().pipe(
          switchMap(() => next(addToken(req))),
          catchError(err => throwError(() => err))
        );
      }
      return throwError(() => error);
    })
  );
};
