import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon } from '@ionic/angular';
import { OrdiniService } from '../../../core/services/ordini.service';
import { OrdineStatus } from '../../../core/models/ordine.model';

@Component({
  selector: 'app-lista-ordini',
  templateUrl: 'lista-ordini.page.html',
  styleUrls: ['lista-ordini.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, DatePipe],
})
export class ListaOrdiniPage {
  private readonly route = inject(ActivatedRoute);
  readonly ordiniService = inject(OrdiniService);

  private readonly rdaId = this.route.snapshot.queryParamMap.get('rdaId');

  get listaOrdinata() {
    const lista = this.rdaId ? this.ordiniService.getByRda(this.rdaId) : this.ordiniService.listaOrdini();
    return [...lista].sort((a, b) => b.dataOrdine.localeCompare(a.dataOrdine));
  }

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

  sideClass(stato: OrdineStatus): string {
    switch (stato) {
      case OrdineStatus.InLavorazione:
        return 'blue';
      case OrdineStatus.Spedito:
        return 'yellow';
      default:
        return 'green';
    }
  }
}
