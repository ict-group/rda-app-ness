import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
import { RdsService } from '../../../core/services/rds.service';
import { AttrezzatureService } from '../../../core/services/attrezzature.service';
import { RdaStatus } from '../../../core/models/rda.model';
import { StatoMezzo } from '../../../core/models/rds.model';

@Component({
  selector: 'app-dettaglio-rds',
  templateUrl: 'dettaglio-rds.page.html',
  styleUrls: ['dettaglio-rds.page.scss'],
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
    DatePipe,
  ],
})
export class DettaglioRdsPage implements ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  readonly rdsService = inject(RdsService);
  readonly attrezzatureService = inject(AttrezzatureService);

  readonly StatoMezzo = StatoMezzo;

  private readonly rdsId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly rds = computed(() => this.rdsService.getById(this.rdsId()));

  ionViewWillEnter(): void {
    void this.rdsService.caricaDettaglio(this.rdsId());
  }

  async elimina(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Elimina richiesta',
      message: 'Vuoi eliminare questa RDS non ancora inviata? L\'operazione non è reversibile.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: async () => {
            await this.rdsService.eliminaRds(this.rdsId());
            await this.router.navigateByUrl('/tabs/lista-rda');
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
}
