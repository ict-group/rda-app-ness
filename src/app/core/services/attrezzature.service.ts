import { Injectable, signal } from '@angular/core';
import { Attrezzatura, TipoAttrezzatura } from '../models/attrezzatura.model';
import { DatabaseService, SqlRow } from './database.service';
import { AttrezzatureApiService } from './attrezzature-api.service';
import { ImpostazioniService } from './impostazioni.service';
import { NetworkService } from './network.service';

export type TipoScaricoAttrezzature = 'tipiAttrezzatura' | 'attrezzature';

interface StatoScarico {
  scaricato: boolean;
  ultimoScarico: string | null;
}

type StatoAttrezzature = Record<TipoScaricoAttrezzature, StatoScarico>;

const STATO_DEFAULT: StatoAttrezzature = {
  tipiAttrezzatura: { scaricato: false, ultimoScarico: null },
  attrezzature: { scaricato: false, ultimoScarico: null },
};

@Injectable({ providedIn: 'root' })
export class AttrezzatureService {
  constructor(
    private readonly db: DatabaseService,
    private readonly api: AttrezzatureApiService,
    private readonly impostazioni: ImpostazioniService,
    private readonly network: NetworkService,
  ) {}

  readonly tipiAttrezzatura = signal<TipoAttrezzatura[]>([]);
  readonly attrezzature = signal<Attrezzatura[]>([]);

  readonly stato = signal<StatoAttrezzature>(STATO_DEFAULT);
  readonly isDownloading = signal<TipoScaricoAttrezzature | null>(null);

  /** Vedi `AnagraficheService.chiamateInCorso`: evita richieste duplicate in parallelo per lo stesso tipo. */
  private readonly chiamateInCorso = new Map<TipoScaricoAttrezzature, Promise<void>>();

  /** Popola i signal dalle tabelle SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const [tipi, attrezzature, statoRighe] = await Promise.all([
      this.db.query<SqlRow>('SELECT id, nome FROM tipi_attrezzatura'),
      this.db.query<SqlRow>('SELECT id, codice, nome, tipo_attrezzatura_id FROM attrezzature'),
      this.db.query<SqlRow>('SELECT tipo, scaricato, ultimo_scarico FROM stato_attrezzature'),
    ]);

    this.tipiAttrezzatura.set(tipi.map((t) => ({ id: t['id'] as string, nome: t['nome'] as string })));
    this.attrezzature.set(
      attrezzature.map((a) => ({
        id: a['id'] as string,
        codice: a['codice'] as string,
        nome: a['nome'] as string,
        tipoAttrezzaturaId: a['tipo_attrezzatura_id'] as string,
      })),
    );

    const statoCaricato: StatoAttrezzature = { ...STATO_DEFAULT };
    for (const riga of statoRighe) {
      const tipo = riga['tipo'] as TipoScaricoAttrezzature;
      statoCaricato[tipo] = {
        scaricato: Number(riga['scaricato']) === 1,
        ultimoScarico: (riga['ultimo_scarico'] as string | null) ?? null,
      };
    }
    this.stato.set(statoCaricato);
  }

  nomeTipo(tipoAttrezzaturaId: string): string {
    return this.tipiAttrezzatura().find((t) => t.id === tipoAttrezzaturaId)?.nome ?? '-';
  }

  nomeAttrezzatura(attrezzaturaId: string): string {
    return this.attrezzature().find((a) => a.id === attrezzaturaId)?.nome ?? '-';
  }

  attrezzaturePerTipo(tipoAttrezzaturaId: string): Attrezzatura[] {
    return this.attrezzature().filter((a) => a.tipoAttrezzaturaId === tipoAttrezzaturaId);
  }

  /**
   * Online aggiorna solo il signal in memoria (persist: false): nessuna scrittura su
   * SQLite, che in modalità online resta riservata alle sole RDA/RDS non ancora inviate.
   */
  async assicurati(tipo: TipoScaricoAttrezzature): Promise<void> {
    if (this.impostazioni.modalitaOffline()) return;
    if (!this.network.isOnline()) return;
    await this.scarica(tipo, false);
  }

  async scarica(tipo: TipoScaricoAttrezzature, persist = true): Promise<void> {
    const inCorso = this.chiamateInCorso.get(tipo);
    if (inCorso) return inCorso;

    const promessa = this.eseguiScarica(tipo, persist).finally(() => this.chiamateInCorso.delete(tipo));
    this.chiamateInCorso.set(tipo, promessa);
    return promessa;
  }

  private async eseguiScarica(tipo: TipoScaricoAttrezzature, persist: boolean): Promise<void> {
    this.isDownloading.set(tipo);

    switch (tipo) {
      case 'tipiAttrezzatura': {
        const risposta = await this.api.getTipiAttrezzatura();
        const tipi: TipoAttrezzatura[] = risposta.map((t) => ({
          id: String(t.id),
          nome: t.descrizione ?? t.codice,
        }));
        if (persist) {
          await this.db.run('DELETE FROM tipi_attrezzatura');
          await this.db.transazione(
            tipi.map((t) => ({
              statement: 'INSERT INTO tipi_attrezzatura (id, nome) VALUES (?, ?)',
              values: [t.id, t.nome],
            })),
          );
        }
        this.tipiAttrezzatura.set(tipi);
        break;
      }
      case 'attrezzature': {
        const risposta = await this.api.getAttrezzature();
        const attrezzature: Attrezzatura[] = risposta.map((a) => ({
          id: String(a.id),
          codice: a.codice,
          nome: a.descrizione ?? a.codice,
          tipoAttrezzaturaId: a.tipoId != null ? String(a.tipoId) : '',
        }));
        if (persist) {
          await this.db.run('DELETE FROM attrezzature');
          await this.db.transazione(
            attrezzature.map((a) => ({
              statement: 'INSERT INTO attrezzature (id, codice, nome, tipo_attrezzatura_id) VALUES (?, ?, ?, ?)',
              values: [a.id, a.codice, a.nome, a.tipoAttrezzaturaId],
            })),
          );
        }
        this.attrezzature.set(attrezzature);
        break;
      }
    }

    if (persist) {
      const ultimoScarico = new Date().toISOString();
      await this.db.run(
        `INSERT INTO stato_attrezzature (tipo, scaricato, ultimo_scarico) VALUES (?, 1, ?)
         ON CONFLICT(tipo) DO UPDATE SET scaricato = 1, ultimo_scarico = excluded.ultimo_scarico`,
        [tipo, ultimoScarico],
      );
      this.stato.update((stato) => ({ ...stato, [tipo]: { scaricato: true, ultimoScarico } }));
    }
    this.isDownloading.set(null);
  }
}
