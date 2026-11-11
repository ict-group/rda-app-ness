import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'rda_app_db';
const DB_VERSION = 1;

/**
 * Schema SQLite dell'app. Ogni tabella sostituisce quella che prima era una chiave di
 * localStorage nei vari service (Anagrafiche, Budget, Rda, Rds, Sync, Attrezzature).
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cantieri (
    id TEXT PRIMARY KEY,
    ragione_sociale TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS business_unit (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gruppi_merceologici (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    grumer_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS articoli (
    id TEXT PRIMARY KEY,
    codice TEXT NOT NULL,
    nome TEXT NOT NULL,
    gruppo_merceologico_id TEXT NOT NULL,
    um TEXT NOT NULL,
    prezzo REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget_gruppi (
    gruppo_merceologico_id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    totale REAL NOT NULL,
    residuo REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget_generale (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    totale REAL NOT NULL,
    residuo REAL NOT NULL,
    periodo TEXT
  );

  CREATE TABLE IF NOT EXISTS cantiere_selezionato (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cantiere_id TEXT NOT NULL,
    ragione_sociale TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stato_anagrafiche (
    tipo TEXT PRIMARY KEY,
    scaricato INTEGER NOT NULL,
    ultimo_scarico TEXT
  );

  CREATE TABLE IF NOT EXISTS tipi_attrezzatura (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attrezzature (
    id TEXT PRIMARY KEY,
    codice TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo_attrezzatura_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stato_attrezzature (
    tipo TEXT PRIMARY KEY,
    scaricato INTEGER NOT NULL,
    ultimo_scarico TEXT
  );

  CREATE TABLE IF NOT EXISTS rda (
    id TEXT PRIMARY KEY,
    descrizione TEXT NOT NULL,
    importo REAL NOT NULL,
    data TEXT NOT NULL,
    data_creazione TEXT NOT NULL,
    stato TEXT NOT NULL,
    cantiere_id TEXT,
    gruppo_merceologico_id TEXT,
    business_unit TEXT,
    sincronizzato INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS rda_righe (
    id TEXT PRIMARY KEY,
    rda_id TEXT NOT NULL,
    articolo_id TEXT NOT NULL,
    codice TEXT NOT NULL,
    nome TEXT NOT NULL,
    um TEXT NOT NULL,
    quantita REAL NOT NULL,
    prezzo REAL NOT NULL,
    importo REAL NOT NULL,
    gruppo_merceologico_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rds (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    stato TEXT NOT NULL,
    tipo_attrezzatura_id TEXT NOT NULL,
    attrezzatura_id TEXT NOT NULL,
    cod_art TEXT NOT NULL,
    note TEXT NOT NULL,
    orari_accesso TEXT,
    rif_cliente TEXT NOT NULL,
    telefono TEXT NOT NULL,
    stato_mezzo TEXT NOT NULL,
    sincronizzato INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ultima_sincronizzazione TEXT
  );

  CREATE TABLE IF NOT EXISTS impostazioni (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    modalita_offline INTEGER NOT NULL DEFAULT 0
  );
`;

export interface SqlRow {
  [colonna: string]: unknown;
}

/**
 * Wrapper unico su CapacitorSQLite: apre/crea la connessione e applica lo schema una
 * sola volta all'avvio dell'app (vedi main.ts), poi espone query/run generici che i
 * vari service usano al posto di localStorage.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private connessione: SQLiteDBConnection | null = null;
  private pronta: Promise<void> | null = null;

  /** Da chiamare una sola volta all'avvio, prima di leggere/scrivere qualunque tabella. */
  init(): Promise<void> {
    if (!this.pronta) {
      this.pronta = this.inizializza();
    }
    return this.pronta;
  }

  async query<T extends SqlRow>(sql: string, valori: unknown[] = []): Promise<T[]> {
    return this.accoda(async () => {
      const connessione = await this.attendiConnessione();
      const risultato = await connessione.query(sql, valori);
      return (risultato.values ?? []) as T[];
    });
  }

  async run(sql: string, valori: unknown[] = []): Promise<void> {
    await this.accoda(async () => {
      const connessione = await this.attendiConnessione();
      // transaction=false: nessun wrapping automatico, vedi nota su `transazione()`.
      await connessione.run(sql, valori, false);
      await this.persistiSuWeb();
    });
  }

  /** Esegue più statement in un'unica transazione (utile per salvare liste intere in un colpo). */
  async transazione(statements: { statement: string; values?: unknown[] }[]): Promise<void> {
    await this.accoda(async () => {
      const connessione = await this.attendiConnessione();

      await connessione.beginTransaction();
      try {
        for (const { statement, values } of statements) {
          // transaction=false: il quarto parametro di default è true, cioè ogni run() aprirebbe
          // una propria transazione implicita in conflitto con quella aperta sopra a mano.
          await connessione.run(statement, values ?? [], false);
        }
        await connessione.commitTransaction();
        await this.persistiSuWeb();
      } catch (errore) {
        await connessione.rollbackTransaction();
        throw errore;
      }
    });
  }

  /**
   * Serializza tutte le operazioni sulla connessione: query/run/transazione condividono
   * un'unica connessione nativa, e due scritture concorrenti (es. da due service diversi
   * che partono in parallelo) possono altrimenti sovrapporsi e corrompere lo stato di una
   * transazione (visto su Android: "BeginTransaction: Already in transaction").
   */
  private coda: Promise<unknown> = Promise.resolve();

  private accoda<T>(azione: () => Promise<T>): Promise<T> {
    // `coda` non rigetta mai (l'eventuale errore è assorbito qui sotto): rappresenta solo
    // "l'operazione precedente si è conclusa", che sia andata a buon fine o no.
    const risultato = this.coda.then(azione);
    this.coda = risultato.then(
      () => undefined,
      () => undefined,
    );
    return risultato;
  }

  /**
   * Sul web il database vive in memoria (sql.js): senza questa chiamata dopo ogni
   * scrittura, un refresh della pagina ricarica l'ultimo snapshot salvato in IndexedDB
   * (nel nostro caso solo lo schema vuoto) perdendo tutte le scritture successive.
   * Nativo (Android/iOS) scrive invece direttamente su file e non ne ha bisogno.
   */
  private async persistiSuWeb(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      await this.sqlite.saveToStore(DB_NAME);
    }
  }

  private async attendiConnessione(): Promise<SQLiteDBConnection> {
    await this.init();
    if (!this.connessione) throw new Error('Connessione SQLite non inizializzata');
    return this.connessione;
  }

  private async inizializza(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      // Su web la connessione nativa non esiste: il plugin salva i DB tramite il web
      // component <jeep-sqlite> (IndexedDB) + sql.js. Va inizializzato una sola volta
      // e richiede che il custom element sia già definito.
      await this.caricaScriptJeepSqlite();
      await customElements.whenDefined('jeep-sqlite');
      await this.sqlite.initWebStore();
    }

    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    this.connessione = isConn
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);

    await this.connessione.open();
    await this.connessione.execute(SCHEMA);
    await this.persistiSuWeb();
  }

  /**
   * Inietta lo script di jeep-sqlite a runtime (non da index.html né da un import statico):
   * un tag <script type="module"> scritto direttamente nell'HTML, o un import ESM in
   * main.ts, viene intercettato da Vite in dev-server come parte del proprio grafo di
   * moduli e il caricamento fallisce in modo incostante. Impostando `src` da JS dopo il
   * bootstrap, il browser lo richiede come un normale asset statico.
   */
  private caricaScriptJeepSqlite(): Promise<void> {
    if (customElements.get('jeep-sqlite')) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'assets/jeep-sqlite/jeep-sqlite.esm.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Caricamento di jeep-sqlite.esm.js fallito'));
      document.head.appendChild(script);
    });
  }
}
