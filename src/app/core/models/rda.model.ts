export enum RdaStatus {
  Creato = 'CREATO',
  InAttesa = 'IN_ATTESA',
  Approvata = 'APPROVATA',
  Rifiutata = 'RIFIUTATA',
  /** Invio al backend non riuscito (offline o fallito): resta in coda per "Invia tutto". */
  DaInviare = 'DA_INVIARE',
}

export interface RigaRda {
  id: string;
  articoloId: string;
  codice: string;
  nome: string;
  um: string;
  quantita: number;
  prezzo: number;
  importo: number;
  gruppoMerceologicoId: string;
}

export interface Rda {
  id: string;
  descrizione: string;
  importo: number;
  data: string;
  dataCreazione: string;
  stato: RdaStatus;
  cantiereId?: string;
  gruppoMerceologicoId?: string;
  businessUnit?: string;
  righe?: RigaRda[];
  /** True quando l'invio al backend è andato a buon fine; false = resta in coda per "Invia tutto". */
  sincronizzato: boolean;
}

export interface NuovaRdaInput {
  cantiereId: string;
  gruppoMerceologicoId: string;
  businessUnit: string;
  nota: string;
  dataConsegna: string;
  righe: RigaRda[];
}
