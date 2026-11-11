import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonSkeletonText,
  AlertController,
  ViewWillEnter,
} from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ImpostazioniService } from '../../../core/services/impostazioni.service';
import { AnagraficheService } from '../../../core/services/anagrafiche.service';
import { BudgetService } from '../../../core/services/budget.service';
import { RdaService } from '../../../core/services/rda.service';
import { RdsService } from '../../../core/services/rds.service';
import { SyncService } from '../../../core/services/sync.service';
import { NetworkService } from '../../../core/services/network.service';
import { AttrezzatureService } from '../../../core/services/attrezzature.service';
import { RdaStatus } from '../../../core/models/rda.model';
import { StatoMezzo } from '../../../core/models/rds.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonContent,
    IonIcon,
    IonButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSpinner,
    IonSkeletonText,
    DatePipe,
    RouterLink,
  ],
})
export class HomePage implements ViewWillEnter {
  readonly authService = inject(AuthService);
  readonly impostazioniService = inject(ImpostazioniService);
  readonly anagraficheService = inject(AnagraficheService);
  readonly budgetService = inject(BudgetService);
  readonly rdaService = inject(RdaService);
  readonly rdsService = inject(RdsService);
  readonly syncService = inject(SyncService);
  readonly networkService = inject(NetworkService);
  readonly attrezzatureService = inject(AttrezzatureService);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);

  readonly RdaStatus = RdaStatus;
  readonly StatoMezzo = StatoMezzo;
  readonly tabAttivo = signal<'rda' | 'rds'>('rda');
  readonly budgetAttivo = signal(0);

  ionViewWillEnter(): void {
    if (this.impostazioniService.modalitaOffline() && !this.anagraficheService.stato().cantieri.scaricato) {
      void this.vaiAConfigurazionePrimoAccesso();
      return;
    }
    // 'cantieri' è pesante: `assicurati` la scarica una sola volta (persistita), non ad ogni
    // apertura della home — il loading in home.page.html segue `anagraficheService.isDownloading()`.
    void this.anagraficheService.assicurati('cantieri');
    void this.aggiornaBudget();

    // "Ultime inserite" legge rdaService.ultimeRda/rdsService.ultimeRds: senza questa chiamata
    // restano vuote finché l'utente non apre almeno una volta Lista Richieste.
    void this.rdaService.caricaLista({ reset: true });
    void this.rdsService.caricaLista({ reset: true });
  }

  private async vaiAConfigurazionePrimoAccesso(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Dati non sincronizzati',
      message: 'Prima di usare l\'app devi sincronizzare i dati.',
      buttons: ['OK'],
    });
    await alert.present();
    await alert.onDidDismiss();
    await this.router.navigateByUrl('/tabs/configurazione');
  }

  async aggiornaBudget(): Promise<void> {
    await this.anagraficheService.assicurati('gruppi');
  }

  /** Switch RDA/RDS in "Ultime inserite": ricarica sempre dal backend, non solo la prima volta. */
  cambiaTab(tab: 'rda' | 'rds'): void {
    this.tabAttivo.set(tab);
    if (tab === 'rda') {
      void this.rdaService.caricaLista({ reset: true });
    } else {
      void this.rdsService.caricaLista({ reset: true });
    }
  }

  async inviaTutto(): Promise<void> {
    await this.syncService.inviaTutti();
  }

  onBudgetScroll(container: HTMLElement): void {
    const indice = Math.round(container.scrollLeft / container.clientWidth);
    this.budgetAttivo.set(indice);
  }

  async logout(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Esci',
      message: 'Vuoi davvero uscire dall\'app?',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Esci',
          role: 'destructive',
          handler: async () => {
            await this.authService.logout();
            this.router.navigateByUrl('/login');
          },
        },
      ],
    });
    await alert.present();
  }

  statusLabel(stato: RdaStatus): string {
    switch (stato) {
      case RdaStatus.Creato:
        return 'Creata';
      case RdaStatus.Approvata:
        return 'Approvato';
      case RdaStatus.Rifiutata:
        return 'Non approvata';
      case RdaStatus.DaInviare:
        return 'Da inviare';
      default:
        return 'Da approvare';
    }
  }

  statusClass(stato: RdaStatus): string {
    switch (stato) {
      case RdaStatus.Creato:
        return 'creato';
      case RdaStatus.Approvata:
        return 'approvata';
      case RdaStatus.Rifiutata:
        return 'rifiutata';
      case RdaStatus.DaInviare:
        return 'da-inviare';
      default:
        return 'in-attesa';
    }
  }

  sideClass(stato: RdaStatus): string {
    switch (stato) {
      case RdaStatus.Creato:
        return 'blue';
      case RdaStatus.Approvata:
        return 'green';
      case RdaStatus.Rifiutata:
        return 'red';
      case RdaStatus.DaInviare:
        return 'gray';
      default:
        return 'yellow';
    }
  }
}
