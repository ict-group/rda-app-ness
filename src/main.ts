import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { registerAllIcons } from './app/core/icon-functions';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { errorInterceptor } from './app/core/interceptors/error.interceptor';
import { AnagraficheService } from './app/core/services/anagrafiche.service';
import { AttrezzatureService } from './app/core/services/attrezzature.service';
import { BudgetService } from './app/core/services/budget.service';
import { DatabaseService } from './app/core/services/database.service';
import { AuthService } from './app/core/services/auth.service';
import { ImpostazioniService } from './app/core/services/impostazioni.service';
import { KeycloakService } from './app/core/services/keycloak.service';
import { RdaService } from './app/core/services/rda.service';
import { RdsService } from './app/core/services/rds.service';
import { SyncService } from './app/core/services/sync.service';

registerAllIcons();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
  ],
}).then(async (appRef) => {
  const injector = appRef.injector;

  try {
    await injector.get(DatabaseService).init();
    await Promise.all([
      injector.get(ImpostazioniService).caricaDaDb(),
      injector.get(AnagraficheService).caricaDaDb(),
      injector.get(BudgetService).caricaDaDb(),
      injector.get(RdaService).caricaDaDb(),
      injector.get(RdsService).caricaDaDb(),
      injector.get(AttrezzatureService).caricaDaDb(),
    ]);
    // SyncService dipende da Rda/RdsService già caricati, per calcolare pendingCount.
    await injector.get(SyncService).caricaDaDb();
  } catch (errore) {
    // Non blocchiamo l'avvio dell'app se il DB locale non è inizializzabile (es. ambiente
    // non supportato): le pagine mostreranno semplicemente liste vuote finché non si risolve.
    console.error('Inizializzazione database locale fallita:', errore);
  }

  // Istanzia AuthService subito: il suo effect() si occupa di inizializzare le push notification
  // solo dopo un login riuscito (non all'avvio, per non interferire col ripristino della sessione).
  injector.get(AuthService);

  const keycloakService = injector.get(KeycloakService);
  void keycloakService.restoreSession();
});
