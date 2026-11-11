import { GruppoMerceologico } from './anagrafiche.model';
import { NuovaRdaInput, RigaRda } from './rda.model';

export interface RigaInvioRda {
  codArt: string;
  quantita: number;
  grumerId?: number;
}

export interface InvioRdaPayload {
  codCantiere: string;
  codBu: string;
  dataConsegna: string;
  nota: string;
  righe: RigaInvioRda[];
}

/** Costruisce il payload da inviare al backend (POST non ancora disponibile), a partire dai dati già raccolti in app. */
export function toInvioRdaPayload(input: NuovaRdaInput, gruppiMerceologici: GruppoMerceologico[]): InvioRdaPayload {
  return {
    codCantiere: input.cantiereId,
    codBu: input.businessUnit,
    dataConsegna: input.dataConsegna,
    nota: input.nota,
    righe: input.righe.map((riga) => mappaRiga(riga, gruppiMerceologici)),
  };
}

function mappaRiga(riga: RigaRda, gruppiMerceologici: GruppoMerceologico[]): RigaInvioRda {
  return {
    codArt: riga.codice,
    quantita: riga.quantita,
    grumerId: gruppiMerceologici.find((g) => g.id === riga.gruppoMerceologicoId)?.grumerId,
  };
}
