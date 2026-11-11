export interface Cantiere {
  id: string;
  ragioneSociale: string;
}

/** Business unit associata al cantiere (arriva già dalla chiamata /cantieri, insieme al cantiere stesso). */
export interface BusinessUnit {
  id: string;
  nome: string;
}

export interface GruppoMerceologico {
  id: string;
  nome: string;
  /** ID tecnico richiesto dal backend per /assortimento; assente nei gruppi senza budget. */
  grumerId?: number;
}

export interface Articolo {
  id: string;
  codice: string;
  nome: string;
  gruppoMerceologicoId: string;
  um: string;
  prezzo: number;
}
