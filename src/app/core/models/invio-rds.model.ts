import { NuovaRdsInput, StatoMezzo } from './rds.model';

export interface InvioRdsPayload {
  tipoAttrezzaturaId: string;
  /** Codice alfanumerico dell'attrezzatura (es. "DEC-002"), non l'id numerico interno. */
  idAttrezzatura: string;
  note: string;
  orariAccesso: string;
  rifCliente: string;
  telefono: string;
  statoMezzo: StatoMezzo;
}

/** Costruisce il payload da inviare al backend (POST /api/mobile/rda/newRds), a partire dai dati raccolti in app. */
export function toInvioRdsPayload(input: NuovaRdsInput): InvioRdsPayload {
  return {
    tipoAttrezzaturaId: input.tipoAttrezzaturaId,
    idAttrezzatura: input.codArt,
    note: input.note,
    orariAccesso: input.orariAccesso,
    rifCliente: input.rifCliente,
    telefono: input.telefono,
    statoMezzo: input.statoMezzo,
  };
}
