import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../../environments/environment';
import { generateCodeChallenge, generateRandomString } from './pkce.util';
import { KeycloakTokenClaims, KeycloakTokenResponse } from '../models/keycloak-token.model';

const REFRESH_TOKEN_KEY = 'rda_app_kc_refresh_token';
const PENDING_FLOW_KEY = 'rda_app_kc_pending_flow';
const NATIVE_REDIRECT_URI = 'rdaness://auth/callback';

interface PendingFlow {
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

interface InMemorySession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private readonly authorizeUrl = `${environment.keycloak.url}/realms/${environment.keycloak.realm}/protocol/openid-connect/auth`;
  private readonly tokenUrl = `${environment.keycloak.url}/realms/${environment.keycloak.realm}/protocol/openid-connect/token`;
  private readonly logoutUrl = `${environment.keycloak.url}/realms/${environment.keycloak.realm}/protocol/openid-connect/logout`;
  private readonly clientId = environment.keycloak.clientId;

  private readonly isNative = Capacitor.isNativePlatform();

  private session: InMemorySession | null = null;
  private lastHandledRedirectUrl: string | null = null;
  readonly claims = signal<KeycloakTokenClaims | null>(null);
  /** Esito del tentativo di login nativo (listener sul redirect): valorizzato solo in caso di errore. */
  readonly loginError = signal<string | null>(null);
  /** true mentre proviamo a ripristinare la sessione da un refresh token persistito (solo nativo). */
  readonly restoringSession = signal(this.isNative);

  constructor(private readonly http: HttpClient) {
    if (this.isNative) {
      App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => this.onNativeRedirect(event.url));
    }
  }

  get isLoggedIn(): boolean {
    return this.claims() !== null;
  }

  /** Avvia il login redirigendo a Keycloak (web) o aprendo il browser di sistema (nativo). */
  async login(): Promise<void> {
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = this.isNative ? NATIVE_REDIRECT_URI : this.webRedirectUri();

    this.loginError.set(null);

    const pending: PendingFlow = { state, codeVerifier, redirectUri };
    await this.savePendingFlow(pending);

    const authUrl = this.buildAuthorizeUrl(state, codeChallenge, redirectUri);

    if (this.isNative) {
      await Browser.open({ url: authUrl, presentationStyle: 'popover' });
    } else {
      window.location.href = authUrl;
    }
  }

  /** Da invocare nella route di callback web con l'URL corrente. */
  async handleWebRedirectCallback(url: string): Promise<void> {
    await this.exchangeRedirectUrl(url);
  }

  /** Tenta di ripristinare la sessione all'avvio usando il refresh token persistito (solo nativo). */
  async restoreSession(): Promise<void> {
    if (!this.isNative) return;

    try {
      const refreshToken = await this.readPersistedRefreshToken();
      if (!refreshToken) return;

      try {
        await this.refreshAccessToken(refreshToken);
      } catch (err) {
        // Non cancelliamo il refresh token persistito su un fallimento generico (es. rete non
        // ancora pronta all'avvio a freddo): altrimenti un errore transitorio costringerebbe
        // l'utente a rifare il login ad ogni riavvio dell'app. Lo cancelliamo solo al logout.
        console.error('[KeycloakService] Ripristino sessione fallito, refresh token mantenuto per il prossimo tentativo.', err);
      }
    } finally {
      this.restoringSession.set(false);
    }
  }

  async logout(): Promise<void> {
    const refreshToken = this.session?.refreshToken ?? (await this.readPersistedRefreshToken());

    if (refreshToken) {
      const body = new URLSearchParams({ client_id: this.clientId, refresh_token: refreshToken }).toString();
      const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
      try {
        await firstValueFrom(this.http.post(this.logoutUrl, body, { headers }));
      } catch {
        // la sessione lato server potrebbe essere già scaduta: ignoriamo l'errore
      }
    }

    await this.clearPendingFlow();
    await this.clearPersistedRefreshToken();
    this.session = null;
    this.lastHandledRedirectUrl = null;
    this.claims.set(null);
  }

  async getValidAccessToken(): Promise<string | null> {
    if (!this.session) return null;

    const isExpiringSoon = this.session.expiresAt - Date.now() < 10_000;
    if (!isExpiringSoon) return this.session.accessToken;
    if (!this.session.refreshToken) return null;

    try {
      const refreshed = await this.refreshAccessToken(this.session.refreshToken);
      return refreshed.accessToken;
    } catch {
      // Come in restoreSession(): non cancelliamo il refresh token persistito per un fallimento
      // generico, altrimenti un problema di rete transitorio obbligherebbe a un nuovo login.
      this.session = null;
      this.claims.set(null);
      return null;
    }
  }

  private async savePendingFlow(pending: PendingFlow): Promise<void> {
    const value = JSON.stringify(pending);
    if (this.isNative) {
      await Preferences.set({ key: PENDING_FLOW_KEY, value });
    } else {
      sessionStorage.setItem(PENDING_FLOW_KEY, value);
    }
  }

  private async readPendingFlow(): Promise<PendingFlow | null> {
    try {
      const raw = this.isNative
        ? (await Preferences.get({ key: PENDING_FLOW_KEY })).value
        : sessionStorage.getItem(PENDING_FLOW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private async clearPendingFlow(): Promise<void> {
    if (this.isNative) {
      await Preferences.remove({ key: PENDING_FLOW_KEY });
    } else {
      sessionStorage.removeItem(PENDING_FLOW_KEY);
    }
  }

  private webRedirectUri(): string {
    return `${window.location.origin}/auth/callback`;
  }

  private buildAuthorizeUrl(state: string, codeChallenge: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${this.authorizeUrl}?${params.toString()}`;
  }

  private async onNativeRedirect(url: string): Promise<void> {
    if (!url.startsWith(NATIVE_REDIRECT_URI)) return;
    if (url === this.lastHandledRedirectUrl) return; // Android può consegnare lo stesso deep link più volte
    this.lastHandledRedirectUrl = url;
    await Browser.close();

    try {
      await this.exchangeRedirectUrl(url);
    } catch (err) {
      // Il listener non è collegato alla promise di login(): se non intercettiamo qui l'errore
      // resta un uncaught rejection e la UI (es. "Accesso in corso...") resta bloccata per sempre.
      this.loginError.set(err instanceof Error ? err.message : 'Accesso non riuscito, riprova.');
    }
  }

  private async exchangeRedirectUrl(url: string): Promise<void> {
    const pending = await this.readPendingFlow();
    await this.clearPendingFlow();
    if (!pending) {
      // Nessun modo per distinguere un vero errore da una consegna duplicata del deep link
      // (frequente su Android dopo il resume dell'app): ignoriamo senza mostrare errori.
      return;
    }

    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const error = parsed.searchParams.get('error');

    if (error) throw new Error(`Keycloak login error: ${error}`);
    if (!code || !state || state !== pending.state) throw new Error('Callback OAuth non valido');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier,
    }).toString();

    await this.requestToken(body);
  }

  private async refreshAccessToken(refreshToken: string): Promise<InMemorySession> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken,
    }).toString();

    return this.requestToken(body);
  }

  private async requestToken(body: string): Promise<InMemorySession> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const token = await firstValueFrom(
      this.http.post<KeycloakTokenResponse>(this.tokenUrl, body, { headers }),
    );

    const session: InMemorySession = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    this.session = session;
    this.claims.set(KeycloakService.decodeClaims(token.access_token));

    if (session.refreshToken) {
      await this.persistRefreshToken(session.refreshToken);
    }

    return session;
  }

  private async persistRefreshToken(refreshToken: string): Promise<void> {
    if (this.isNative) {
      await Preferences.set({ key: REFRESH_TOKEN_KEY, value: refreshToken });
    } else {
      // Nessuna sessione persistita fuori dall'app nativa: la sessione web vive solo in memoria
      // e si ricostruisce tramite redirect a Keycloak (SSO) se l'utente ricarica la pagina.
    }
  }

  private async readPersistedRefreshToken(): Promise<string | null> {
    if (!this.isNative) return null;
    try {
      const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
      return value || null;
    } catch {
      return null;
    }
  }

  private async clearPersistedRefreshToken(): Promise<void> {
    if (!this.isNative) return;
    await Preferences.remove({ key: REFRESH_TOKEN_KEY });
  }

  private static decodeClaims(accessToken: string): KeycloakTokenClaims {
    const payload = accessToken.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  }
}
