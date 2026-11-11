import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonButton,
  IonSkeletonText,
  AlertController,
  ViewWillEnter,
} from '@ionic/angular';
import { RdaService } from '../../../core/services/rda.service';
import { AnagraficheService } from '../../../core/services/anagrafiche.service';
import { BudgetService, BudgetGruppo } from '../../../core/services/budget.service';
import { RdaStatus, RigaRda } from '../../../core/models/rda.model';

interface RiepilogoGruppo {
  gruppoId: string;
  nome: string;
  righe: RigaRda[];
  subtotale: number;
  budget?: BudgetGruppo;
}

@Component({
  selector: 'app-dettaglio-rda',
  templateUrl: 'dettaglio-rda.page.html',
  styleUrls: ['dettaglio-rda.page.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonButton,
    IonSkeletonText,
    DecimalPipe,
    DatePipe,
    RouterLink,
  ],
})
export class DettaglioRdaPage implements ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  readonly rdaService = inject(RdaService);
  readonly anagraficheService = inject(AnagraficheService);
  readonly budgetService = inject(BudgetService);

  private readonly rdaId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly rda = computed(() => this.rdaService.getById(this.rdaId()));

  ionViewWillEnter(): void {
    void this.rdaService.caricaDettaglio(this.rdaId());
  }

  async elimina(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Elimina richiesta',
      message: 'Vuoi eliminare questa RDA non ancora inviata? L\'operazione non è reversibile.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: async () => {
            await this.rdaService.eliminaRda(this.rdaId());
            await this.router.navigateByUrl('/tabs/lista-rda');
          },
        },
      ],
    });
    await alert.present();
  }

  readonly riepilogoGruppi = computed<RiepilogoGruppo[]>(() => {
    const voci = new Map<string, RiepilogoGruppo>();
    for (const riga of this.rda()?.righe ?? []) {
      const voce = voci.get(riga.gruppoMerceologicoId) ?? {
        gruppoId: riga.gruppoMerceologicoId,
        nome: this.anagraficheService.nomeGruppo(riga.gruppoMerceologicoId),
        righe: [],
        subtotale: 0,
        budget: this.budgetService.budgetGruppi().find((g) => g.gruppoMerceologicoId === riga.gruppoMerceologicoId),
      };
      voce.righe.push(riga);
      voce.subtotale += riga.importo;
      voci.set(riga.gruppoMerceologicoId, voce);
    }
    return Array.from(voci.values());
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
}
