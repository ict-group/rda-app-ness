export enum OrdineStatus {
  InLavorazione = 'IN_LAVORAZIONE',
  Spedito = 'SPEDITO',
  Consegnato = 'CONSEGNATO',
}

export interface Ordine {
  id: string;
  rdaId: string;
  dataOrdine: string;
  dataConsegna: string;
  stato: OrdineStatus;
  fornitore: string;
}
