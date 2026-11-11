import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  ArticoloAssortimento,
  BudgetGruppoMerceologico,
  CantiereBu,
  RdaListItem,
  RdaRowItem,
  RdsListItem,
} from '../models/rda-mobile.model';
import type { InvioRdaPayload } from '../models/invio-rda.model';
import type { InvioRdsPayload } from '../models/invio-rds.model';

@Injectable({ providedIn: 'root' })
export class RdaMobileApiService {
  private readonly baseUrl = environment.apiUrl;
  /** /rdas, /rda-rows, /rds vivono sotto /api, non sotto /api/mobile/rda (vedi AttrezzatureApiService). */
  private readonly rootUrl = environment.apiRoot;
  private readonly http = inject(HttpClient);

  async getCantieri(): Promise<CantiereBu[]> {
    return firstValueFrom(this.http.get<CantiereBu[]>(`${this.baseUrl}/cantieri`));
  }

  async getBudget(codCantiere: string): Promise<BudgetGruppoMerceologico[]> {
    const params = new HttpParams().set('codCantiere', codCantiere);
    return firstValueFrom(this.http.get<BudgetGruppoMerceologico[]>(`${this.baseUrl}/budget`, { params }));
  }

  async getAssortimento(grumerId: number): Promise<ArticoloAssortimento[]> {
    const params = new HttpParams().set('grumerId', grumerId);
    return firstValueFrom(this.http.get<ArticoloAssortimento[]>(`${this.baseUrl}/assortimento`, { params }));
  }

  /** POST /api/mobile/rda/newRda: salva testata+righe in un'unica transazione, risponde 201 con l'entity creata. */
  async postNewRda(payload: InvioRdaPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${this.baseUrl}/newRda`, payload));
  }

  /** POST /api/mobile/rda/newRds: salva l'entity, risponde 201 con l'entity creata. */
  async postNewRds(payload: InvioRdsPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${this.baseUrl}/newRds`, payload));
  }

  /** GET /rdas: lista paginata, usata in modalità online per popolare/aggiornare la lista richieste. */
  async getRdas(pageSize: number, page = 1): Promise<RdaListItem[]> {
    const params = new HttpParams().set('pageSize', pageSize).set('page', page);
    return firstValueFrom(this.http.get<RdaListItem[]>(`${this.rootUrl}/rdas`, { params }));
  }

  async getRdaById(uuid: string): Promise<RdaListItem> {
    return firstValueFrom(this.http.get<RdaListItem>(`${this.rootUrl}/rdas/${uuid}`));
  }

  /** GET /rda-rows: righe della singola RDA, filtrate per uuid testata. */
  async getRdaRows(uuidRda: string, pageSize = 100): Promise<RdaRowItem[]> {
    const params = new HttpParams().set('obj.uuid_rda', uuidRda).set('pageSize', pageSize);
    return firstValueFrom(this.http.get<RdaRowItem[]>(`${this.rootUrl}/rda-rows`, { params }));
  }

  /** GET /rds: lista paginata, usata in modalità online per popolare/aggiornare la lista richieste. */
  async getRds(pageSize: number, page = 1): Promise<RdsListItem[]> {
    const params = new HttpParams().set('pageSize', pageSize).set('page', page);
    return firstValueFrom(this.http.get<RdsListItem[]>(`${this.rootUrl}/rds`, { params }));
  }

  async getRdsById(uuid: string): Promise<RdsListItem> {
    return firstValueFrom(this.http.get<RdsListItem>(`${this.rootUrl}/rds/${uuid}`));
  }

  // TODO: endpoint non ancora disponibile su papalini-ext-be: creare lato backend prima di abilitare la chiamata.
  async registraPushToken(token: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.baseUrl}/push/registra-token`, { token }));
  }
}
