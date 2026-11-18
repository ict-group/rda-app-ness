import { Injectable, signal } from '@angular/core';
import { Ordine, OrdineStatus, RigaOrdine } from '../models/ordine.model';

function rigaOrdine(
  articoloId: string,
  codice: string,
  nome: string,
  quantita: number,
  prezzo: number,
): RigaOrdine {
  return {
    id: crypto.randomUUID(),
    articoloId,
    codice,
    nome,
    um: 'PZ',
    quantita,
    prezzo,
    importo: prezzo * quantita,
  };
}

const SEED_DATA: Ordine[] = [
  {
    id: 'o1',
    rdaId: '1',
    dataOrdine: '2026-10-29',
    dataConsegna: '2026-11-03',
    stato: OrdineStatus.Consegnato,
    fornitore: 'Ness Srl',
    righe: [
      rigaOrdine('2', 'INTRA-SCOTCH01', 'Scotch da pacco', 10, 1.25),
      rigaOrdine('3', 'INTRA-CART50', 'Cartoni 50%', 20, 0.95),
    ],
  },
  {
    id: 'o2',
    rdaId: '2',
    dataOrdine: '2026-11-03',
    dataConsegna: '2026-11-10',
    stato: OrdineStatus.Spedito,
    fornitore: 'Ness Srl',
    righe: [rigaOrdine('1', 'IGR-CARIG01', 'Carta igienica', 4, 18.5)],
  },
  {
    id: 'o3',
    rdaId: '4',
    dataOrdine: '2026-11-05',
    dataConsegna: '2026-11-12',
    stato: OrdineStatus.InLavorazione,
    fornitore: 'Ness Srl',
    righe: [
      rigaOrdine('4', 'INTRA-RAYSENSIL', 'Guanti nitrile senza polvere', 15, 3.5),
      rigaOrdine('5', 'INTRA-EUSCO008', 'Scopa nylon per interni', 3, 1.25),
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class OrdiniService {
  readonly listaOrdini = signal<Ordine[]>(SEED_DATA);

  getByRda(rdaId: string): Ordine[] {
    return this.listaOrdini().filter((ordine) => ordine.rdaId === rdaId);
  }

  getById(id: string): Ordine | undefined {
    return this.listaOrdini().find((ordine) => ordine.id === id);
  }
}
