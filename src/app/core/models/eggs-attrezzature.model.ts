/** Risposta di GET /api/eggs_tipi_attrezzature (tabella tabtipoattr). */
export interface EggsTipoAttrezzatura {
  id: number;
  azCod: number;
  codice: string;
  descrizione: string | null;
}

/** Risposta di GET /api/eggs_attrezzature (tabella attrezzature). */
export interface EggsAttrezzatura {
  id: number;
  azCod: number;
  codice: string;
  descrizione: string | null;
  tipoId: number | null;
}
