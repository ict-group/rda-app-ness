import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular';
import { KeycloakService } from '../../core/services/keycloak.service';

@Component({
  selector: 'app-auth-callback',
  template: `
    <ion-content class="ion-padding ion-text-center">
      @if (errorMessage()) {
        <p>{{ errorMessage() }}</p>
      } @else {
        <ion-spinner name="crescent"></ion-spinner>
      }
    </ion-content>
  `,
  imports: [IonContent, IonSpinner],
})
export class AuthCallbackPage implements OnInit {
  private readonly keycloakService = inject(KeycloakService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.keycloakService.handleWebRedirectCallback(window.location.href);
      await this.router.navigateByUrl('/tabs/home');
    } catch {
      this.errorMessage.set('Login non riuscito, riprova.');
      setTimeout(() => this.router.navigateByUrl('/login'), 2000);
    }
  }
}
