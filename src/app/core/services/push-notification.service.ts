import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  FirebaseMessaging,
  type NotificationActionPerformedEvent,
  type NotificationReceivedEvent,
  type TokenReceivedEvent,
} from '@capacitor-firebase/messaging';

/**
 * Registrazione del device alle push notification via Firebase Cloud Messaging (Android) / APNs (iOS),
 * tramite @capacitor-firebase/messaging (stessa libreria usata su camst-mobile, cross-platform).
 *
 * init() va richiamato dopo il login (la registrazione del token richiede un utente autenticato) e non
 * all'avvio dell'app: richiedere il permesso push in concomitanza con il ripristino della sessione causava
 * un conflitto nel ciclo di vita dell'Activity Android che faceva scadere la sessione.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized || !Capacitor.isNativePlatform()) {
      return;
    }
    this.initialized = true;

    try {
      const stato = await FirebaseMessaging.requestPermissions();
      if (stato.receive !== 'granted') {
        console.warn('[PushNotificationService] Permesso notifiche push negato.');
        return;
      }

      await FirebaseMessaging.removeAllListeners();

      FirebaseMessaging.addListener('tokenReceived', (token: TokenReceivedEvent) => {
        console.log('[PushNotificationService] Token FCM:', token.token);
        void this.registraToken(token.token);
      });

      FirebaseMessaging.addListener('notificationReceived', (evento: NotificationReceivedEvent) => {
        console.log('[PushNotificationService] Notifica ricevuta in foreground.', evento);
      });

      FirebaseMessaging.addListener(
        'notificationActionPerformed',
        (azione: NotificationActionPerformedEvent) => {
          console.log("[PushNotificationService] Notifica aperta dall'utente.", azione.notification);
        },
      );

      const { token } = await FirebaseMessaging.getToken();
      console.log('[PushNotificationService] Token FCM:', token);
      await this.registraToken(token);
    } catch (errore) {
      console.error('[PushNotificationService] Inizializzazione push notification fallita.', errore);
    }
  }

  /** Da richiamare al logout: evita che il device continui a ricevere notifiche per l'utente uscito. */
  async unload(): Promise<void> {
    if (!this.initialized) return;
    this.initialized = false;

    try {
      await FirebaseMessaging.removeAllListeners();
      await FirebaseMessaging.deleteToken();
    } catch (errore) {
      console.error('[PushNotificationService] Pulizia push notification fallita.', errore);
    }
  }

  private async registraToken(token: string): Promise<void> {
    // TODO: l'endpoint /mobile/rda/push/registra-token non esiste ancora lato backend (404).
    // Riattivare la chiamata (RdaMobileApiService.registraPushToken) una volta implementato.
    void token;
  }
}
