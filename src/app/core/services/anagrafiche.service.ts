import { Injectable, signal } from '@angular/core';
import { Articolo, BusinessUnit, Cantiere, GruppoMerceologico } from '../models/anagrafiche.model';
import { RdaMobileApiService } from './rda-mobile-api.service';
import { BudgetService } from './budget.service';
import { DatabaseService, SqlRow } from './database.service';
import { ImpostazioniService } from './impostazioni.service';
import { NetworkService } from './network.service';

/**
 * Enrichment locale per i campi non ancora esposti da /assortimento (um, prezzo).
 * Da rimuovere quando il backend li aggiungerà alla risposta reale.
 */
const UM_DEFAULT = 'PZ';
const PREZZO_DEFAULT = 0;

/**
 * TEMPORANEO: il backend non filtra ancora i cantieri per utente autenticato (ogni utente
 * vedrà solo i propri quando sarà implementato lato backend). Per ora l'app è "cablata"
 * su questo cantiere di test, così non serve selezionarlo manualmente ad ogni avvio.
 * Resta comunque possibile cambiarlo dal modal in Sincronizza.
 */
const CANTIERE_CABLATO: Cantiere = { id: '8439', ragioneSociale: 'QC Terme Resort Montebianco' };

export type TipoAnagrafica = 'cantieri' | 'gruppi' | 'articoli';

interface StatoAnagrafica {
  scaricato: boolean;
  ultimoScarico: string | null;
}

type StatoAnagrafiche = Record<TipoAnagrafica, StatoAnagrafica>;

const STATO_DEFAULT: StatoAnagrafiche = {
  cantieri: { scaricato: false, ultimoScarico: null },
  gruppi: { scaricato: false, ultimoScarico: null },
  articoli: { scaricato: false, ultimoScarico: null },
};

@Injectable({ providedIn: 'root' })
export class AnagraficheService {
  constructor(
    private readonly api: RdaMobileApiService,
    private readonly budgetService: BudgetService,
    private readonly db: DatabaseService,
    private readonly impostazioni: ImpostazioniService,
    private readonly network: NetworkService,
  ) {}

  readonly cantieri = signal<Cantiere[]>([]);
  readonly cantiereSelezionato = signal<Cantiere | null>(null);
  readonly businessUnit = signal<BusinessUnit[]>([]);
  readonly gruppiMerceologici = signal<GruppoMerceologico[]>([]);
  readonly articoli = signal<Articolo[]>([]);

  readonly stato = signal<StatoAnagrafiche>(STATO_DEFAULT);
  readonly isDownloading = signal<TipoAnagrafica | null>(null);

  /** Evita richieste duplicate in parallelo per lo stesso tipo (es. home e nuova-rda che
   *  chiamano `assicurati` quasi insieme): chi arriva dopo si aggancia alla chiamata già in corso. */
  private readonly chiamateInCorso = new Map<TipoAnagrafica, Promise<void>>();

  /** Popola i signal dalle tabelle SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const [cantieri, businessUnit, gruppi, articoli, statoRighe, cantiereSelRighe] = await Promise.all([
      this.db.query<SqlRow>('SELECT id, ragione_sociale FROM cantieri'),
      this.db.query<SqlRow>('SELECT id, nome FROM business_unit'),
      this.db.query<SqlRow>('SELECT id, nome, grumer_id FROM gruppi_merceologici'),
      this.db.query<SqlRow>('SELECT id, codice, nome, gruppo_merceologico_id, um, prezzo FROM articoli'),
      this.db.query<SqlRow>('SELECT tipo, scaricato, ultimo_scarico FROM stato_anagrafiche'),
      this.db.query<SqlRow>('SELECT cantiere_id, ragione_sociale FROM cantiere_selezionato WHERE id = 1'),
    ]);

    this.cantieri.set(cantieri.map((c) => ({ id: c['id'] as string, ragioneSociale: c['ragione_sociale'] as string })));
    this.businessUnit.set(businessUnit.map((b) => ({ id: b['id'] as string, nome: b['nome'] as string })));
    this.gruppiMerceologici.set(
      gruppi.map((g) => ({
        id: g['id'] as string,
        nome: g['nome'] as string,
        grumerId: g['grumer_id'] == null ? undefined : Number(g['grumer_id']),
      })),
    );
    this.articoli.set(
      articoli.map((a) => ({
        id: a['id'] as string,
        codice: a['codice'] as string,
        nome: a['nome'] as string,
        gruppoMerceologicoId: a['gruppo_merceologico_id'] as string,
        um: a['um'] as string,
        prezzo: Number(a['prezzo']),
      })),
    );

    const statoCaricato: StatoAnagrafiche = { ...STATO_DEFAULT };
    for (const riga of statoRighe) {
      const tipo = riga['tipo'] as TipoAnagrafica;
      statoCaricato[tipo] = {
        scaricato: Number(riga['scaricato']) === 1,
        ultimoScarico: (riga['ultimo_scarico'] as string | null) ?? null,
      };
    }
    this.stato.set(statoCaricato);

    if (cantiereSelRighe.length > 0) {
      const riga = cantiereSelRighe[0];
      this.cantiereSelezionato.set({
        id: riga['cantiere_id'] as string,
        ragioneSociale: riga['ragione_sociale'] as string,
      });
    } else {
      // Primo avvio: nessuna riga salvata ancora, partiamo dal cantiere cablato.
      await this.salvaCantiereSelezionato(CANTIERE_CABLATO);
      this.cantiereSelezionato.set(CANTIERE_CABLATO);
    }
  }

  nomeGruppo(gruppoMerceologicoId: string): string {
    return this.gruppiMerceologici().find((g) => g.id === gruppoMerceologicoId)?.nome ?? '-';
  }

  nomeCantiere(cantiereId: string): string {
    return this.cantieri().find((c) => c.id === cantiereId)?.ragioneSociale ?? '-';
  }

  articoliPerGruppo(gruppoMerceologicoId: string): Articolo[] {
    return this.articoli().filter((a) => a.gruppoMerceologicoId === gruppoMerceologicoId);
  }

  /** Il cantiere scelto dall'utente in Sincronizza, usato per tutte le chiamate e per la UI (home, nuova RDA). */
  get cantiereCorrente(): Cantiere | undefined {
    return this.cantiereSelezionato() ?? undefined;
  }

  async selezionaCantiere(cantiere: Cantiere): Promise<void> {
    await this.salvaCantiereSelezionato(cantiere);
    this.cantiereSelezionato.set(cantiere);

    // Cambiando cantiere, gruppi/articoli/budget scaricati in precedenza non sono più validi.
    await this.db.run('DELETE FROM gruppi_merceologici');
    this.gruppiMerceologici.set([]);
    await this.db.run('DELETE FROM articoli');
    this.articoli.set([]);
    await this.budgetService.impostaBudgetGruppi([]);
    await this.budgetService.impostaBudgetGenerale(null);
  }

  /**
   * Da chiamare dalle pagine che hanno bisogno del dato (home, nuova-rda): in modalità
   * offline non fa nulla (si usa solo il sync manuale in Configurazione); senza rete al
   * momento non fa nulla (si usa la cache già presente).
   *
   * 'cantieri' è una chiamata pesante (migliaia di righe): va fatta una sola volta e poi
   * mai più, quindi se già scaricata (flag persistito in SQLite, sopravvive ai riavvii)
   * non viene rifatta, e quando viene fatta il risultato resta salvato su SQLite anche
   * online. 'gruppi'/'articoli' restano invece on-demand ad ogni chiamata, solo in
   * memoria (persist: false), perché più leggere e legate al cantiere corrente.
   */
  async assicurati(tipo: TipoAnagrafica): Promise<void> {
    if (tipo === 'cantieri' && this.stato().cantieri.scaricato) return;
    if (this.impostazioni.modalitaOffline()) return;
    if (!this.network.isOnline()) return;
    await this.scarica(tipo, tipo === 'cantieri');
  }

  async scarica(tipo: TipoAnagrafica, persist = true): Promise<void> {
    const inCorso = this.chiamateInCorso.get(tipo);
    if (inCorso) return inCorso;

    const promessa = this.eseguiScarica(tipo, persist).finally(() => this.chiamateInCorso.delete(tipo));
    this.chiamateInCorso.set(tipo, promessa);
    return promessa;
  }

  private async eseguiScarica(tipo: TipoAnagrafica, persist: boolean): Promise<void> {
    this.isDownloading.set(tipo);
    try {
      switch (tipo) {
        case 'cantieri':
          await this.scaricaCantieri(persist);
          break;
        case 'gruppi':
          await this.scaricaGruppi(persist);
          break;
        case 'articoli':
          await this.scaricaArticoli(persist);
          break;
      }
      if (persist) await this.segnaScaricato(tipo);
    } finally {
      this.isDownloading.set(null);
    }
  }

  private async scaricaCantieri(persist: boolean): Promise<void> {
    const risposta = await this.api.getCantieri();
    const cantieri = this.dedupeById(
      risposta.map((c) => ({ id: c.codCantiere, ragioneSociale: c.cantiere })),
    );

    if (persist) {
      await this.db.run('DELETE FROM cantieri');
      await this.db.transazione(
        cantieri.map((c) => ({
          statement: 'INSERT INTO cantieri (id, ragione_sociale) VALUES (?, ?)',
          values: [c.id, c.ragioneSociale],
        })),
      );
    }
    this.cantieri.set(cantieri);

    // Se il cantiere selezionato è ancora il placeholder "cablato", aggiorniamo il nome
    // reale appena disponibile, senza toccare gruppi/articoli già scaricati.
    const selezionato = this.cantiereSelezionato();
    const reale = selezionato && cantieri.find((c) => c.id === selezionato.id);
    if (reale && reale.ragioneSociale !== selezionato.ragioneSociale) {
      if (persist) await this.salvaCantiereSelezionato(reale);
      this.cantiereSelezionato.set(reale);
    }

    // Le business unit arrivano già in questa stessa chiamata (una riga per combinazione cantiere+BU).
    // Vanno filtrate sul cantiere selezionato: la risposta contiene le BU di TUTTI i cantieri.
    const codCantiereCorrente = this.cantiereCorrente?.id;
    const businessUnit = codCantiereCorrente
      ? this.dedupeById(
          risposta
            .filter((c) => c.codCantiere === codCantiereCorrente && c.codBu && c.businessUnit)
            .map((c) => ({ id: c.codBu!, nome: c.businessUnit! })),
        )
      : [];
    if (persist) {
      await this.db.run('DELETE FROM business_unit');
      await this.db.transazione(
        businessUnit.map((b) => ({
          statement: 'INSERT INTO business_unit (id, nome) VALUES (?, ?)',
          values: [b.id, b.nome],
        })),
      );
    }
    this.businessUnit.set(businessUnit);
  }

  private async scaricaGruppi(persist: boolean): Promise<void> {
    const cantiere = this.cantiereCorrente;
    if (!cantiere) return;

    const risposta = await this.api.getBudget(cantiere.id);
    const righeConGruppo = risposta.filter((g) => g.codGrumer || g.grumerId);
    const righeSenzaGruppo = risposta.filter((g) => !g.codGrumer && !g.grumerId);

    const gruppi = this.dedupeById(
      righeConGruppo.map((g) => ({
        id: g.codGrumer ?? String(g.grumerId),
        nome: g.grumer ?? g.codGrumer ?? '',
        grumerId: g.grumerId ?? undefined,
      })),
    );
    if (persist) {
      await this.db.run('DELETE FROM gruppi_merceologici');
      await this.db.transazione(
        gruppi.map((g) => ({
          statement: 'INSERT INTO gruppi_merceologici (id, nome, grumer_id) VALUES (?, ?, ?)',
          values: [g.id, g.nome, g.grumerId ?? null],
        })),
      );
    }
    this.gruppiMerceologici.set(gruppi);

    await this.budgetService.impostaBudgetGruppi(
      righeConGruppo.map((g) => ({
        gruppoMerceologicoId: g.codGrumer ?? String(g.grumerId),
        nome: g.grumer ?? g.codGrumer ?? '',
        totale: g.importoBudget ?? 0,
      })),
      persist,
    );

    // Righe di budget del cantiere non legate a nessun gruppo merceologico (grumerId/codGrumer null):
    // le sommiamo in un budget generale, altrimenti andrebbero perse.
    const totaleSenzaGruppo = righeSenzaGruppo.reduce((somma, g) => somma + (g.importoBudget ?? 0), 0);
    await this.budgetService.impostaBudgetGenerale(
      righeSenzaGruppo.length > 0
        ? { totale: totaleSenzaGruppo, periodo: righeSenzaGruppo[0].periodo ?? null }
        : null,
      persist,
    );
  }

  private async scaricaArticoli(persist: boolean): Promise<void> {
    const gruppi = this.gruppiMerceologici().filter((g) => g.grumerId !== undefined);
    if (gruppi.length === 0) return;

    // allSettled, non all: su rete scarsa una singola chiamata per gruppo può andare in
    // timeout senza buttare via gli articoli dei gruppi che invece sono arrivati.
    const risultati = await Promise.allSettled(
      gruppi.map(async (gruppo) => {
        const risposta = await this.api.getAssortimento(gruppo.grumerId!);
        return risposta.map((a) => ({
          id: a.codArt,
          codice: a.codArt,
          nome: a.articolo,
          gruppoMerceologicoId: gruppo.id,
          um: UM_DEFAULT,
          prezzo: a.prezzo ?? PREZZO_DEFAULT,
        }));
      }),
    );

    const articoliPerGruppo = risultati
      .filter((r): r is PromiseFulfilledResult<Articolo[]> => r.status === 'fulfilled')
      .map((r) => r.value);
    for (const r of risultati) {
      if (r.status === 'rejected') console.error('Assortimento di un gruppo non scaricato:', r.reason);
    }

    const articoli = this.dedupeById(articoliPerGruppo.flat());
    if (persist) {
      await this.db.run('DELETE FROM articoli');
      await this.db.transazione(
        articoli.map((a) => ({
          statement:
            'INSERT INTO articoli (id, codice, nome, gruppo_merceologico_id, um, prezzo) VALUES (?, ?, ?, ?, ?, ?)',
          values: [a.id, a.codice, a.nome, a.gruppoMerceologicoId, a.um, a.prezzo],
        })),
      );
    }
    this.articoli.set(articoli);
  }

  private async salvaCantiereSelezionato(cantiere: Cantiere): Promise<void> {
    await this.db.run(
      `INSERT INTO cantiere_selezionato (id, cantiere_id, ragione_sociale) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET cantiere_id = excluded.cantiere_id, ragione_sociale = excluded.ragione_sociale`,
      [cantiere.id, cantiere.ragioneSociale],
    );
  }

  private dedupeById<T extends { id: string }>(elementi: T[]): T[] {
    const mappa = new Map(elementi.map((e) => [e.id, e]));
    return Array.from(mappa.values());
  }

  private async segnaScaricato(tipo: TipoAnagrafica): Promise<void> {
    const ultimoScarico = new Date().toISOString();
    await this.db.run(
      `INSERT INTO stato_anagrafiche (tipo, scaricato, ultimo_scarico) VALUES (?, 1, ?)
       ON CONFLICT(tipo) DO UPDATE SET scaricato = 1, ultimo_scarico = excluded.ultimo_scarico`,
      [tipo, ultimoScarico],
    );
    this.stato.update((stato) => ({
      ...stato,
      [tipo]: { scaricato: true, ultimoScarico },
    }));
  }
}
