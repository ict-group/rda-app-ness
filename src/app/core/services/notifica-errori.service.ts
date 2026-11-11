import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** Popup toast per errori di rete (offline, timeout, invio/download falliti). */
@Injectable({ providedIn: 'root' })
export class NotificaErroriService {
  private readonly toastController = inject(ToastController);

  async mostraOffline(): Promise<void> {
    await this.mostra('Sei offline: la richiesta verrà ritentata quando torna la connessione.', 'warning');
  }

  async mostraTimeout(): Promise<void> {
    await this.mostra('La richiesta ha impiegato troppo tempo a rispondere. Riprova.', 'danger');
  }

  async mostraErroreDownload(): Promise<void> {
    await this.mostra('Download dati non riuscito. Riprova più tardi.', 'danger');
  }

  async mostraErroreInvio(tipo: 'RDA' | 'RDS'): Promise<void> {
    await this.mostra(
      `Invio ${tipo} non riuscito dopo diversi tentativi: resta salvata in "Da inviare" e verrà ritentata alla prossima sincronizzazione.`,
      'danger',
    );
  }

  async mostraSuccessoInvio(tipo: 'RDA' | 'RDS'): Promise<void> {
    await this.mostra(`${tipo} inviata con successo.`, 'success');
  }

  async mostraSessioneScaduta(): Promise<void> {
    await this.mostra('Sessione scaduta: accedi di nuovo.', 'danger');
  }

  private async mostra(message: string, color: 'warning' | 'danger' | 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      color,
      duration: 4000,
      position: 'top',
      buttons: [{ text: 'Chiudi', role: 'cancel' }],
    });
    await toast.present();
  }
}
