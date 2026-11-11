import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonButton, IonSpinner, IonToggle } from '@ionic/angular';
import { SyncService } from '../../../core/services/sync.service';
import { NetworkService } from '../../../core/services/network.service';
import { ImpostazioniService } from '../../../core/services/impostazioni.service';
import { AnagraficheService, TipoAnagrafica } from '../../../core/services/anagrafiche.service';
import { AttrezzatureService, TipoScaricoAttrezzature } from '../../../core/services/attrezzature.service';
import { RdaService } from '../../../core/services/rda.service';
import { RdsService } from '../../../core/services/rds.service';
import { MockNotificationService } from '../../../core/services/mock-notification.service';
// TEMPORANEO: import usati solo dalla selezione cantiere via modal, vedi nota sotto.
// import { computed } from '@angular/core';
// import { IonModal, IonSearchbar, IonList, IonItem } from '@ionic/angular';
// import { Cantiere } from '../../../core/models/anagrafiche.model';

@Component({
  selector: 'app-configurazione',
  templateUrl: 'configurazione.page.html',
  styleUrls: ['configurazione.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonButton, IonSpinner, IonToggle, DatePipe],
})
export class ConfigurazionePage {
  readonly syncService = inject(SyncService);
  readonly networkService = inject(NetworkService);
  readonly impostazioniService = inject(ImpostazioniService);
  readonly anagraficheService = inject(AnagraficheService);
  readonly attrezzatureService = inject(AttrezzatureService);
  private readonly rdaService = inject(RdaService);
  private readonly rdsService = inject(RdsService);
  private readonly mockNotificationService = inject(MockNotificationService);

  readonly isSincronizzandoTutto = signal(false);
  readonly isGenerandoEsempi = signal(false);
  /** Messaggio di dettaglio mostrato sotto lo spinner di "Sincronizza tutto": i cantieri sono
   *  tanti (migliaia) e la prima chiamata può richiedere qualche secondo in più delle altre. */
  readonly passoSincronizzazione = signal('');

  /*
   * TEMPORANEO: selezione cantiere tramite modal disabilitata. Per ora l'app è "cablata"
   * sul cantiere 8439 (vedi CANTIERE_CABLATO in anagrafiche.service.ts) — ogni utente
   * avrà i propri cantieri lato backend, a quel punto questa feature va riattivata
   * (vedi anche il markup commentato in sincronizza.page.html).
   *
  readonly modalCantiereAperto = signal(false);
  readonly isCaricandoCantieri = signal(false);
  readonly ricercaCantiere = signal('');

  readonly cantieriFiltrati = computed<Cantiere[]>(() => {
    const termine = this.ricercaCantiere().trim().toLowerCase();
    const lista = this.anagraficheService.cantieri();
    if (!termine) return lista;
    return lista.filter(
      (c) => c.ragioneSociale.toLowerCase().includes(termine) || c.id.toLowerCase().includes(termine),
    );
  });

  async apriSelezionaCantiere(): Promise<void> {
    this.ricercaCantiere.set('');
    this.modalCantiereAperto.set(true);
    this.isCaricandoCantieri.set(true);
    try {
      // La lista dei cantieri per la ricerca viene sempre scaricata online, non dalla cache.
      await this.anagraficheService.scarica('cantieri');
    } finally {
      this.isCaricandoCantieri.set(false);
    }
  }

  chiudiSelezionaCantiere(): void {
    this.modalCantiereAperto.set(false);
  }

  aggiornaRicercaCantiere(valore: string | null | undefined): void {
    this.ricercaCantiere.set(valore ?? '');
  }

  selezionaCantiere(cantiere: Cantiere): void {
    this.anagraficheService.selezionaCantiere(cantiere);
    this.modalCantiereAperto.set(false);
  }
  */

  async sincronizzaTutto(): Promise<void> {
    if (!this.anagraficheService.cantiereCorrente) return;

    this.isSincronizzandoTutto.set(true);
    try {
      // cantieri (e le sue business unit) → gruppi (budget) → articoli (assortimento):
      // ogni chiamata dipende dal risultato della precedente. La selezione cantiere via
      // modal è disabilitata (vedi nota sopra), quindi questa è l'unica chiamata rimasta
      // che scarica/aggiorna il cantiere cablato e le sue business unit.
      this.passoSincronizzazione.set('Scaricamento cantieri (sono migliaia, può richiedere qualche secondo)...');
      await this.anagraficheService.scarica('cantieri');

      this.passoSincronizzazione.set('Scaricamento gruppi merceologici e budget...');
      await this.anagraficheService.scarica('gruppi');

      this.passoSincronizzazione.set('Scaricamento articoli...');
      await this.anagraficheService.scarica('articoli');

      this.passoSincronizzazione.set('Scaricamento attrezzature...');
      await Promise.all([
        this.syncService.sincronizzaOra(),
        this.attrezzatureService.scarica('tipiAttrezzatura'),
        this.attrezzatureService.scarica('attrezzature'),
      ]);
    } catch {
      // il popup di errore (offline/timeout/generico) è già mostrato dall'errorInterceptor
    } finally {
      this.isSincronizzandoTutto.set(false);
      this.passoSincronizzazione.set('');
    }
  }

  async scarica(tipo: TipoAnagrafica): Promise<void> {
    try {
      await this.anagraficheService.scarica(tipo);
    } catch {
      // il popup di errore è già mostrato dall'errorInterceptor
    }
  }

  async scaricaAttrezzature(tipo: TipoScaricoAttrezzature): Promise<void> {
    try {
      await this.attrezzatureService.scarica(tipo);
    } catch {
      // il popup di errore è già mostrato dall'errorInterceptor
    }
  }

  async inviaTutto(): Promise<void> {
    await this.syncService.inviaTutti();
  }

  async impostaModalitaOffline(valore: boolean): Promise<void> {
    await this.impostazioniService.impostaModalitaOffline(valore);
  }

  async generaRichiesteEsempio(): Promise<void> {
    this.isGenerandoEsempi.set(true);
    if (this.anagraficheService.gruppiMerceologici().length === 0) {
      await this.anagraficheService.scarica('gruppi');
    }
    if (this.anagraficheService.cantieri().length === 0) {
      await this.anagraficheService.scarica('cantieri');
    }
    if (this.attrezzatureService.tipiAttrezzatura().length === 0) {
      await this.attrezzatureService.scarica('tipiAttrezzatura');
    }
    await this.rdaService.seedEsempi();
    await this.rdsService.seedEsempi();
    await this.syncService.aggiornaPendingCount();
    this.isGenerandoEsempi.set(false);
  }

  mostraNotificaPushEsempio(): void {
    this.mockNotificationService.mostra({
      titolo: 'RDA approvata',
      messaggio: 'La tua richiesta "Materiale imballaggio magazzino" è stata approvata.',
    });
  }
}
