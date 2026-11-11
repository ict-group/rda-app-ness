import type { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TimeoutError, catchError, throwError, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { NetworkService } from '../services/network.service';
import { NotificaErroriService } from '../services/notifica-errori.service';

const TIMEOUT_MS = 20_000;

/**
 * Per le chiamate verso l'API mobile RDA: applica un timeout, mostra un popup di errore
 * (offline / timeout / sessione scaduta / errore generico) e, su 401/403, chiude la sessione.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiRoot)) {
    return next(req);
  }

  const authService = inject(AuthService);
  const router = inject(Router);
  const network = inject(NetworkService);
  const notifica = inject(NotificaErroriService);

  return next(req).pipe(
    timeout(TIMEOUT_MS),
    catchError((error: HttpErrorResponse | TimeoutError) => {
      if (error instanceof TimeoutError) {
        void notifica.mostraTimeout();
      } else if (!network.isOnline() || error.status === 0) {
        void notifica.mostraOffline();
      } else if (error.status === 401 || error.status === 403) {
        void notifica.mostraSessioneScaduta();
        void authService.logout().finally(() => router.navigateByUrl('/login'));
      } else {
        void notifica.mostraErroreDownload();
      }
      return throwError(() => error);
    }),
  );
};
