import { Injectable, computed, effect, inject } from '@angular/core';
import { KeycloakService } from './keycloak.service';
import { PushNotificationService } from './push-notification.service';
import { MockUser } from '../models/user.model';

const DEFAULT_CANTIERE = 'Cantiere Ness';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly keycloakService = inject(KeycloakService);
  private readonly pushNotificationService = inject(PushNotificationService);

  readonly currentUser = computed<MockUser | null>(() => {
    const claims = this.keycloakService.claims();
    if (!claims) return null;

    return {
      nome: claims.given_name ?? claims.preferred_username ?? '',
      cognome: claims.family_name ?? '',
      username: claims.preferred_username ?? claims.sub,
      cantiere: DEFAULT_CANTIERE,
    };
  });

  get isLoggedIn(): boolean {
    return this.keycloakService.isLoggedIn;
  }

  /** Errore del tentativo di login nativo in corso (valorizzato in modo asincrono dal redirect). */
  readonly loginError = this.keycloakService.loginError;

  /** true mentre proviamo a ripristinare una sessione precedente da un refresh token persistito. */
  readonly restoringSession = this.keycloakService.restoringSession;

  constructor() {
    // Le push notification si inizializzano solo dopo un login riuscito (serve un utente
    // autenticato per registrare il token): PushNotificationService.init() è idempotente.
    effect(() => {
      if (this.currentUser()) {
        void this.pushNotificationService.init();
      }
    });
  }

  async login(): Promise<void> {
    await this.keycloakService.login();
  }

  async logout(): Promise<void> {
    await this.pushNotificationService.unload();
    await this.keycloakService.logout();
  }
}
