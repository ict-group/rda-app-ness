import { Component, inject, signal } from '@angular/core';
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
import { AttrezzatureService } from '../../../core/services/attrezzature.service';
import { RdsService } from '../../../core/services/rds.service';
import { SyncService } from '../../../core/services/sync.service';
import { NetworkService } from '../../../core/services/network.service';
import { Attrezzatura } from '../../../core/models/attrezzatura.model';
import { StatoMezzo } from '../../../core/models/rds.model';

@Component({
  selector: 'app-nuova-rds',
  templateUrl: 'nuova-rds.page.html',
  styleUrls: ['nuova-rds.page.scss'],
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
  ],
})
export class NuovaRdsPage implements ViewWillEnter {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly rdsService = inject(RdsService);
  private readonly syncService = inject(SyncService);
  readonly networkService = inject(NetworkService);
  readonly attrezzatureService = inject(AttrezzatureService);

  readonly StatoMezzo = StatoMezzo;

  readonly attrezzaturaSelezionata = signal<Attrezzatura | null>(null);
  readonly modalAttrezzatureAperto = signal(false);
  readonly isInviando = signal(false);

  readonly form = this.fb.nonNullable.group({
    tipoAttrezzaturaId: ['', [Validators.required]],
    note: ['', [Validators.required]],
    orariAccesso: [''],
    rifCliente: ['', [Validators.required]],
    telefono: ['', [Validators.required]],
    statoMezzo: [StatoMezzo.Funzionante, [Validators.required]],
  });

  get tipoSelezionatoId(): string {
    return this.form.controls.tipoAttrezzaturaId.value;
  }

  ionViewWillEnter(): void {
    this.attrezzaturaSelezionata.set(null);
    this.modalAttrezzatureAperto.set(false);
    this.form.reset({
      tipoAttrezzaturaId: '',
      note: '',
      orariAccesso: '',
      rifCliente: '',
      telefono: '',
      statoMezzo: StatoMezzo.Funzionante,
    });

    void this.attrezzatureService.assicurati('tipiAttrezzatura');
    void this.attrezzatureService.assicurati('attrezzature');
  }

  isInvalid(campo: 'tipoAttrezzaturaId' | 'note' | 'rifCliente' | 'telefono'): boolean {
    const control = this.form.get(campo);
    return !!control && control.invalid && control.touched;
  }

  onTipoChange(): void {
    this.attrezzaturaSelezionata.set(null);
  }

  selezionaStatoMezzo(stato: StatoMezzo): void {
    this.form.controls.statoMezzo.setValue(stato);
  }

  attrezzaturePerTipoSelezionato(): Attrezzatura[] {
    return this.tipoSelezionatoId ? this.attrezzatureService.attrezzaturePerTipo(this.tipoSelezionatoId) : [];
  }

  apriModalAttrezzature(): void {
    if (!this.tipoSelezionatoId) return;
    this.modalAttrezzatureAperto.set(true);
  }

  chiudiModalAttrezzature(): void {
    this.modalAttrezzatureAperto.set(false);
  }

  selezionaAttrezzatura(attrezzatura: Attrezzatura): void {
    this.attrezzaturaSelezionata.set(attrezzatura);
    this.chiudiModalAttrezzature();
  }

  rimuoviAttrezzatura(): void {
    this.attrezzaturaSelezionata.set(null);
  }

  async onSubmit(): Promise<void> {
    const attrezzatura = this.attrezzaturaSelezionata();
    if (this.form.invalid || !attrezzatura) {
      this.form.markAllAsTouched();
      return;
    }

    this.isInviando.set(true);
    try {
      const { tipoAttrezzaturaId, note, orariAccesso, rifCliente, telefono, statoMezzo } = this.form.getRawValue();
      const input = {
        tipoAttrezzaturaId,
        attrezzaturaId: attrezzatura.id,
        codArt: attrezzatura.codice,
        note,
        orariAccesso,
        rifCliente,
        telefono,
        statoMezzo,
      };
      const nuova = await this.rdsService.creaRds(input);

      // Se siamo online tenta subito l'invio; altrimenti resta in coda (sincronizzato = false)
      // e verrà ritentata da "Invia tutto" in Sincronizza/Home appena torna la connessione.
      await this.rdsService.inviaRds(nuova);
      await this.syncService.aggiornaPendingCount();

      this.router.navigateByUrl('/tabs/home');
    } finally {
      this.isInviando.set(false);
    }
  }
}
