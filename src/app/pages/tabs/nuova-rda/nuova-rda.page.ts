import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonModal,
  IonFooter,
  IonSpinner,
  ViewWillEnter,
} from '@ionic/angular';
import { AnagraficheService } from '../../../core/services/anagrafiche.service';
import { BudgetService, BudgetGruppo } from '../../../core/services/budget.service';
import { Articolo, Cantiere } from '../../../core/models/anagrafiche.model';
import { RigaRda } from '../../../core/models/rda.model';
import { RdaService } from '../../../core/services/rda.service';
import { SyncService } from '../../../core/services/sync.service';
import { NetworkService } from '../../../core/services/network.service';

interface RiepilogoGruppo {
  gruppoId: string;
  nome: string;
  righe: RigaRda[];
  subtotale: number;
  budget?: BudgetGruppo;
}

@Component({
  selector: 'app-nuova-rda',
  templateUrl: 'nuova-rda.page.html',
  styleUrls: ['nuova-rda.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonModal,
    IonFooter,
    IonSpinner,
    DecimalPipe,
  ],
})
export class NuovaRdaPage implements ViewWillEnter {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly rdaService = inject(RdaService);
  private readonly syncService = inject(SyncService);
  readonly networkService = inject(NetworkService);
  readonly anagraficheService = inject(AnagraficheService);
  readonly budgetService = inject(BudgetService);

  readonly cantiereCorrente = computed<Cantiere | undefined>(() => this.anagraficheService.cantiereCorrente);

  readonly gruppoId = signal<string>('');
  readonly quantita = signal<Record<string, number>>({});
  readonly modalRiepilogoAperto = signal(false);
  readonly isInviando = signal(false);

  readonly articoliDelGruppo = computed<Articolo[]>(() =>
    this.gruppoId() ? this.anagraficheService.articoliPerGruppo(this.gruppoId()) : [],
  );

  readonly righe = computed<RigaRda[]>(() => {
    const mappa = this.quantita();
    return this.anagraficheService
      .articoli()
      .filter((articolo) => (mappa[articolo.id] ?? 0) > 0)
      .map((articolo) => this.rigaDaArticolo(articolo, mappa[articolo.id]));
  });

  readonly totaleRda = computed(() => this.righe().reduce((totale, riga) => totale + riga.importo, 0));

  readonly budgetGruppoSelezionato = computed<BudgetGruppo | undefined>(() =>
    this.budgetService.budgetGruppi().find((g) => g.gruppoMerceologicoId === this.gruppoId()),
  );

  readonly totaleRdaGruppoSelezionato = computed(() =>
    this.righe()
      .filter((riga) => riga.gruppoMerceologicoId === this.gruppoId())
      .reduce((totale, riga) => totale + riga.importo, 0),
  );

  readonly residuo = computed(() => {
    const budget = this.budgetGruppoSelezionato();
    return budget ? budget.residuo - this.totaleRdaGruppoSelezionato() : 0;
  });

  readonly riepilogoGruppi = computed<RiepilogoGruppo[]>(() => {
    const voci = new Map<string, RiepilogoGruppo>();
    for (const riga of this.righe()) {
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

  readonly form = this.fb.nonNullable.group({
    dataConsegna: [this.oggi(), [Validators.required]],
    gruppoMerceologicoId: ['', [Validators.required]],
    businessUnit: ['', [Validators.required]],
    nota: ['', [Validators.required]],
  });

  ionViewWillEnter(): void {
    this.gruppoId.set('');
    this.quantita.set({});
    this.modalRiepilogoAperto.set(false);
    this.form.reset({
      dataConsegna: this.oggi(),
      gruppoMerceologicoId: '',
      businessUnit: '',
      nota: '',
    });

    // sequenziale: articoli dipende dai gruppi appena scaricati (vedi scaricaArticoli).
    void this.caricaAnagraficheOnDemand();
  }

  private async caricaAnagraficheOnDemand(): Promise<void> {
    await this.anagraficheService.assicurati('cantieri');
    await this.anagraficheService.assicurati('gruppi');
    await this.anagraficheService.assicurati('articoli');
  }

  isInvalid(campo: 'dataConsegna' | 'gruppoMerceologicoId' | 'businessUnit' | 'nota'): boolean {
    const control = this.form.get(campo);
    return !!control && control.invalid && control.touched;
  }

  onGruppoChange(): void {
    this.gruppoId.set(this.form.controls.gruppoMerceologicoId.value);
  }

  aggiornaQuantita(articolo: Articolo, valore: number): void {
    const quantitaValida = Number.isFinite(valore) && valore >= 0 ? Math.floor(valore) : 0;
    this.quantita.update((mappa) => ({ ...mappa, [articolo.id]: quantitaValida }));
  }

  apriRiepilogo(): void {
    if (this.form.invalid || this.righe().length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.modalRiepilogoAperto.set(true);
  }

  chiudiRiepilogo(): void {
    this.modalRiepilogoAperto.set(false);
  }

  confermaSalvataggio(): void {
    void this.salva();
  }

  inviaRda(): void {
    if (this.form.invalid || this.righe().length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    void this.salva();
  }

  private async salva(): Promise<void> {
    const cantiere = this.cantiereCorrente();
    if (!cantiere) return;

    this.isInviando.set(true);
    try {
      const { dataConsegna, gruppoMerceologicoId, businessUnit, nota } = this.form.getRawValue();
      const input = {
        cantiereId: cantiere.id,
        gruppoMerceologicoId,
        businessUnit,
        nota,
        dataConsegna,
        righe: this.righe(),
      };
      const nuova = await this.rdaService.creaRda(input);

      // Se siamo online tenta subito l'invio; altrimenti resta in coda (sincronizzato = false)
      // e verrà ritentata da "Invia tutto" in Sincronizza/Home appena torna la connessione.
      await this.rdaService.inviaRda(nuova);
      await this.syncService.aggiornaPendingCount();

      this.modalRiepilogoAperto.set(false);
      setTimeout(() => this.router.navigateByUrl('/tabs/lista-rda'), 300);
    } finally {
      this.isInviando.set(false);
    }
  }

  private rigaDaArticolo(articolo: Articolo, quantita: number): RigaRda {
    return {
      id: articolo.id,
      articoloId: articolo.id,
      codice: articolo.codice,
      nome: articolo.nome,
      um: articolo.um,
      quantita,
      prezzo: articolo.prezzo,
      importo: articolo.prezzo * quantita,
      gruppoMerceologicoId: articolo.gruppoMerceologicoId,
    };
  }

  private oggi(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
