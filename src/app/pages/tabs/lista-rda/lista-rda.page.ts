import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonFab,
  IonFabButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSkeletonText,
  ActionSheetController,
  ViewWillEnter,
} from '@ionic/angular';
import { RdaService } from '../../../core/services/rda.service';
import { RdsService } from '../../../core/services/rds.service';
import { AttrezzatureService } from '../../../core/services/attrezzature.service';
import { Rda, RdaStatus } from '../../../core/models/rda.model';
import { Rds } from '../../../core/models/rds.model';

type Richiesta = { tipo: 'rda'; data: string; rda: Rda } | { tipo: 'rds'; data: string; rds: Rds };

type Filtro = 'tutti' | 'rda' | 'rds';

@Component({
  selector: 'app-lista-rda',
  templateUrl: 'lista-rda.page.html',
  styleUrls: ['lista-rda.page.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonFab,
    IonFabButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonRefresher,
    IonRefresherContent,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonSkeletonText,
    DatePipe,
    RouterLink,
  ],
})
export class ListaRdaPage implements ViewWillEnter {
  readonly rdaService = inject(RdaService);
  readonly rdsService = inject(RdsService);
  readonly attrezzatureService = inject(AttrezzatureService);
  private readonly router = inject(Router);
  private readonly actionSheetController = inject(ActionSheetController);

  readonly filtro = signal<Filtro>('tutti');

  readonly tuttiCaricati = computed(() => this.rdaService.tuttiCaricati() && this.rdsService.tuttiCaricati());

  /** Skeleton sul primo caricamento (apertura pagina, pull-to-refresh): non sullo scroll infinito, che ha già il suo spinner. */
  readonly isCaricandoPrimaVolta = computed(
    () =>
      (this.rdaService.isCaricandoLista() && this.rdaService.paginaCorrente() === 0) ||
      (this.rdsService.isCaricandoLista() && this.rdsService.paginaCorrente() === 0),
  );

  ionViewWillEnter(): void {
    void this.rdaService.caricaLista({ reset: true });
    void this.rdsService.caricaLista({ reset: true });
  }

  async aggiorna(evento: unknown): Promise<void> {
    await Promise.all([
      this.rdaService.caricaLista({ reset: true }),
      this.rdsService.caricaLista({ reset: true }),
    ]);
    (evento as { target: { complete: () => void } }).target.complete();
  }

  async caricaAltri(evento: unknown): Promise<void> {
    await Promise.all([this.rdaService.caricaLista(), this.rdsService.caricaLista()]);
    (evento as { target: { complete: () => void } }).target.complete();
  }

  async apriSceltaNuova(): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      header: 'Nuova richiesta',
      cssClass: 'action-sheet-richieste',
      buttons: [
        {
          text: 'Nuova RDA',
          icon: 'document-text-outline',
          handler: () => this.router.navigateByUrl('/tabs/nuova-rda'),
        },
        {
          text: 'Nuovo RDS',
          icon: 'construct-outline',
          handler: () => this.router.navigateByUrl('/tabs/nuova-rds'),
        },
        {
          text: 'Annulla',
          role: 'cancel',
        },
      ],
    });
    await actionSheet.present();
  }

  readonly richiesteFiltrate = computed<Richiesta[]>(() => {
    const filtro = this.filtro();
    const rda: Richiesta[] =
      filtro === 'rds' ? [] : this.rdaService.listaRda().map((rda) => ({ tipo: 'rda' as const, data: rda.data, rda }));
    const rds: Richiesta[] =
      filtro === 'rda' ? [] : this.rdsService.listaRds().map((rds) => ({ tipo: 'rds' as const, data: rds.data, rds }));
    return [...rda, ...rds].sort((a, b) => b.data.localeCompare(a.data));
  });

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
