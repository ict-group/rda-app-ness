import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonButton,
} from '@ionic/angular';
import { OrdiniService } from '../../../core/services/ordini.service';
import { OrdineStatus } from '../../../core/models/ordine.model';

@Component({
  selector: 'app-dettaglio-ordine',
  templateUrl: 'dettaglio-ordine.page.html',
  styleUrls: ['dettaglio-ordine.page.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonButton,
    DecimalPipe,
    DatePipe,
    RouterLink,
  ],
})
export class DettaglioOrdinePage {
  private readonly route = inject(ActivatedRoute);
  readonly ordiniService = inject(OrdiniService);

  private readonly ordineId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly ordine = computed(() => this.ordiniService.getById(this.ordineId()));

  readonly totale = computed(() => (this.ordine()?.righe ?? []).reduce((t, r) => t + r.importo, 0));

  statusLabel(stato: OrdineStatus): string {
    switch (stato) {
      case OrdineStatus.InLavorazione:
        return 'In lavorazione';
      case OrdineStatus.Spedito:
        return 'Spedito';
      default:
        return 'Consegnato';
    }
  }

  statusClass(stato: OrdineStatus): string {
    switch (stato) {
      case OrdineStatus.InLavorazione:
        return 'in-lavorazione';
      case OrdineStatus.Spedito:
        return 'spedito';
      default:
        return 'consegnato';
    }
  }
}
