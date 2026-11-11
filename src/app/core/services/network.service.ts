import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

/** Stato di connettività dell'app, usato per decidere se tentare l'invio o mettere in coda. */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  readonly isOnline = signal(true);

  constructor() {
    Network.getStatus().then((stato) => this.isOnline.set(stato.connected));
    Network.addListener('networkStatusChange', (stato) => this.isOnline.set(stato.connected));
  }
}
