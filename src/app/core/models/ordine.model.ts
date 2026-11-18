export enum OrdineStatus {
  InLavorazione = 'IN_LAVORAZIONE',
  Spedito = 'SPEDITO',
  Consegnato = 'CONSEGNATO',
}

export interface RigaOrdine {
  id: string;
  articoloId: string;
  codice: string;
  nome: string;
  um: string;
  quantita: number;
  prezzo: number;
  importo: number;
}

export interface Ordine {
  id: string;
  rdaId: string;
  dataOrdine: string;
  dataConsegna: string;
  stato: OrdineStatus;
  fornitore: string;
  righe: RigaOrdine[];
}
