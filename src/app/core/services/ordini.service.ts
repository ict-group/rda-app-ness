import { Injectable, signal } from '@angular/core';
import { Ordine, OrdineStatus } from '../models/ordine.model';

const SEED_DATA: Ordine[] = [
  {
    id: 'o1',
    rdaId: '1',
    dataOrdine: '2026-10-29',
    dataConsegna: '2026-11-03',
    stato: OrdineStatus.Consegnato,
    fornitore: 'Ness Srl',
  },
  {
    id: 'o2',
    rdaId: '2',
    dataOrdine: '2026-11-03',
    dataConsegna: '2026-11-10',
    stato: OrdineStatus.Spedito,
    fornitore: 'Ness Srl',
  },
  {
    id: 'o3',
    rdaId: '4',
    dataOrdine: '2026-11-05',
    dataConsegna: '2026-11-12',
    stato: OrdineStatus.InLavorazione,
    fornitore: 'Ness Srl',
  },
];

@Injectable({ providedIn: 'root' })
export class OrdiniService {
  readonly listaOrdini = signal<Ordine[]>(SEED_DATA);

  getByRda(rdaId: string): Ordine[] {
    return this.listaOrdini().filter((ordine) => ordine.rdaId === rdaId);
  }
}
