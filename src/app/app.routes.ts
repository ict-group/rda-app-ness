import type { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./pages/auth-callback/auth-callback.page').then((m) => m.AuthCallbackPage),
  },
  {
    path: 'tabs',
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadComponent: () => import('./pages/tabs/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'lista-rda',
        loadComponent: () => import('./pages/tabs/lista-rda/lista-rda.page').then((m) => m.ListaRdaPage),
      },
      {
        path: 'nuova-rda',
        loadComponent: () => import('./pages/tabs/nuova-rda/nuova-rda.page').then((m) => m.NuovaRdaPage),
      },
      {
        path: 'nuova-rds',
        loadComponent: () => import('./pages/tabs/nuova-rds/nuova-rds.page').then((m) => m.NuovaRdsPage),
      },
      {
        path: 'dettaglio-rda/:id',
        loadComponent: () =>
          import('./pages/tabs/dettaglio-rda/dettaglio-rda.page').then((m) => m.DettaglioRdaPage),
      },
      {
        path: 'dettaglio-rds/:id',
        loadComponent: () =>
          import('./pages/tabs/dettaglio-rds/dettaglio-rds.page').then((m) => m.DettaglioRdsPage),
      },
      {
        path: 'lista-ordini',
        loadComponent: () => import('./pages/tabs/lista-ordini/lista-ordini.page').then((m) => m.ListaOrdiniPage),
      },
      {
        path: 'configurazione',
        loadComponent: () =>
          import('./pages/tabs/configurazione/configurazione.page').then((m) => m.ConfigurazionePage),
      },
    ],
  },
];
