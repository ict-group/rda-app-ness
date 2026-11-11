import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonButton, IonSpinner, IonIcon } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  imports: [IonContent, IonButton, IonSpinner, IonIcon],
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** true mentre verifichiamo se esiste già una sessione valida da una precedente apertura dell'app. */
  readonly restoringSession = this.authService.restoringSession;

  constructor() {
    // Sul nativo il login si completa in modo asincrono (listener sul redirect dal browser di
    // sistema, o dal ripristino della sessione all'avvio): quando le claim diventano disponibili,
    // navighiamo senza richiedere all'utente di premere di nuovo "Accedi".
    effect(() => {
      if (this.authService.currentUser()) {
        this.router.navigateByUrl('/tabs/home');
      }
    });

    // Se il redirect nativo fallisce (es. deep link duplicato, errore di rete), sblocchiamo lo
    // spinner "Accesso in corso..." che altrimenti resterebbe bloccato indefinitamente.
    effect(() => {
      const error = this.authService.loginError();
      if (error) {
        this.errorMessage.set(error);
        this.isLoading.set(false);
      }
    });
  }

  async onLogin(): Promise<void> {
    if (this.isLoading()) return;

    this.errorMessage.set(null);
    this.isLoading.set(true);

    try {
      await this.authService.login();
    } catch {
      this.errorMessage.set('Non è stato possibile avviare il login');
      this.isLoading.set(false);
    }
  }
}
