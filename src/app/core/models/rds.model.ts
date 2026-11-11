import { RdaStatus } from './rda.model';

export enum StatoMezzo {
  Funzionante = 'FUNZIONANTE',
  Ferma = 'FERMA',
}

export interface Rds {
  id: string;
  data: string;
  stato: RdaStatus;
  tipoAttrezzaturaId: string;
  attrezzaturaId: string;
  codArt: string;
  note: string;
  orariAccesso: string;
  rifCliente: string;
  telefono: string;
  statoMezzo: StatoMezzo;
  /** True quando l'invio al backend è andato a buon fine; false = resta in coda per "Invia tutto". */
  sincronizzato: boolean;
}

export interface NuovaRdsInput {
  tipoAttrezzaturaId: string;
  attrezzaturaId: string;
  codArt: string;
  note: string;
  orariAccesso: string;
  rifCliente: string;
  telefono: string;
  statoMezzo: StatoMezzo;
}
