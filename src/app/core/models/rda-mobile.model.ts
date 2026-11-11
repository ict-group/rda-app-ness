export interface CantiereBu {
  codCantiere: string;
  cantiere: string;
  codBu: string | null;
  businessUnit: string | null;
}

export interface BudgetGruppoMerceologico {
  codCantiere: string;
  cantiere: string;
  grumerId: number | null;
  codGrumer: string | null;
  grumer: string | null;
  importoBudget: number | null;
  periodo: string | null;
}

export interface ArticoloAssortimento {
  codCluster: string | null;
  cluster: string | null;
  codCantiere: string | null;
  cantiere: string | null;
  codArt: string;
  articolo: string;
  /** Non ancora presente in risposta: il backend lo aggiungerà in seguito. */
  prezzo?: number | null;
}

/**
 * Shape di GET /rdas e GET /rdas/{uuid}: campi minimi noti, da confermare col backend
 * (TODO: non ancora documentata) prima di fidarsi ciecamente dei nomi qui sotto.
 */
export interface RdaListItem {
  uuid: string;
  descrizione?: string | null;
  importo?: number | null;
  dataConsegna: string;
  dataCreazione?: string | null;
  stato: string;
  codCantiere?: string | null;
  codGrumer?: string | null;
  codBu?: string | null;
}

/** Shape di GET /rda-rows?obj.uuid_rda={uuid}: TODO da confermare col backend. */
export interface RdaRowItem {
  uuid: string;
  uuidRda: string;
  codArt: string;
  articolo?: string | null;
  quantita: number;
  prezzo?: number | null;
  grumerId?: number | null;
}

/** Shape di GET /rds e GET /rds/{uuid}: TODO da confermare col backend. */
export interface RdsListItem {
  uuid: string;
  data: string;
  stato: string;
  tipoAttrezzaturaId?: string | null;
  attrezzaturaId?: string | null;
  codArt?: string | null;
  note?: string | null;
  orariAccesso?: string | null;
  rifCliente?: string | null;
  telefono?: string | null;
  statoMezzo?: string | null;
}
