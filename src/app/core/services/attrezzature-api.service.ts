import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { EggsAttrezzatura, EggsTipoAttrezzatura } from '../models/eggs-attrezzature.model';

/**
 * Le API "eggs_*" sono generiche (Queryable: pagina/conta/dettaglio) e vivono sotto /api,
 * non sotto /api/mobile/rda come le altre chiamate di RdaMobileApiService.
 */
const BASE_URL = environment.apiRoot;

/** pageSize alto per prendere tutta l'anagrafica in una chiamata: sono tabelle di riferimento, non transazionali. */
const PAGE_SIZE_ANAGRAFICA = 5000;

@Injectable({ providedIn: 'root' })
export class AttrezzatureApiService {
  private readonly http = inject(HttpClient);

  async getTipiAttrezzatura(): Promise<EggsTipoAttrezzatura[]> {
    const params = new HttpParams().set('pageSize', PAGE_SIZE_ANAGRAFICA);
    return firstValueFrom(
      this.http.get<EggsTipoAttrezzatura[]>(`${BASE_URL}/eggs_tipi_attrezzature`, { params }),
    );
  }

  async getAttrezzature(): Promise<EggsAttrezzatura[]> {
    const params = new HttpParams().set('pageSize', PAGE_SIZE_ANAGRAFICA);
    return firstValueFrom(this.http.get<EggsAttrezzatura[]>(`${BASE_URL}/eggs_attrezzature`, { params }));
  }
}
