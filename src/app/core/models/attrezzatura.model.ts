export interface TipoAttrezzatura {
  id: string;
  nome: string;
}

export interface Attrezzatura {
  id: string;
  codice: string;
  nome: string;
  tipoAttrezzaturaId: string;
}
