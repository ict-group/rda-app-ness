import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { KeycloakService } from '../services/keycloak.service';

/** Allega automaticamente il Bearer token alle richieste verso l'API mobile RDA. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiRoot)) {
    return next(req);
  }

  const keycloak = inject(KeycloakService);

  return from(keycloak.getValidAccessToken()).pipe(
    switchMap((token) => {
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token ?? ''}`,
          Accept: 'application/json',
        },
      });
      return next(authReq);
    }),
  );
};
