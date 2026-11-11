import { Injectable, signal } from '@angular/core';
import { NuovaRdsInput, Rds, StatoMezzo } from '../models/rds.model';
import { RdaStatus } from '../models/rda.model';
import { RdsListItem } from '../models/rda-mobile.model';
import { toInvioRdsPayload } from '../models/invio-rds.model';
import { DatabaseService, SqlRow } from './database.service';
import { NetworkService } from './network.service';
import { NotificaErroriService } from './notifica-errori.service';
import { RdaMobileApiService } from './rda-mobile-api.service';
import { ImpostazioniService } from './impostazioni.service';

const TENTATIVI_INVIO = 3;
const ATTESA_TRA_TENTATIVI_MS = 1000;
const PAGE_SIZE_LISTA = 30;

function giorniFa(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

@Injectable({ providedIn: 'root' })
export class RdsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly network: NetworkService,
    private readonly notifica: NotificaErroriService,
    private readonly api: RdaMobileApiService,
    private readonly impostazioni: ImpostazioniService,
  ) {}

  readonly listaRds = signal<Rds[]>([]);
  readonly paginaCorrente = signal(0);
  readonly tuttiCaricati = signal(false);
  readonly isCaricandoLista = signal(false);

  /** Vedi `RdaService.dettaglioInCorso`: evita dettagli duplicati in parallelo per la stessa RDS. */
  private readonly dettaglioInCorso = new Set<string>();
  /** Per lo skeleton in dettaglio-rds.page durante `caricaDettaglio`. */
  readonly isCaricandoDettaglio = signal(false);

  get ultimeRds(): Rds[] {
    return [...this.listaRds()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  }

  /** Popola il signal dalla tabella SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const righeRds = await this.db.query<SqlRow>('SELECT * FROM rds');

    const lista: Rds[] = righeRds.map((r) => ({
      id: r['id'] as string,
      data: r['data'] as string,
      stato: r['stato'] as RdaStatus,
      tipoAttrezzaturaId: r['tipo_attrezzatura_id'] as string,
      attrezzaturaId: r['attrezzatura_id'] as string,
      codArt: r['cod_art'] as string,
      note: r['note'] as string,
      orariAccesso: (r['orari_accesso'] as string | null) ?? '',
      rifCliente: r['rif_cliente'] as string,
      telefono: r['telefono'] as string,
      statoMezzo: r['stato_mezzo'] as StatoMezzo,
      sincronizzato: Number(r['sincronizzato']) === 1,
    }));

    this.listaRds.set(lista);
  }

  getById(id: string): Rds | undefined {
    return this.listaRds().find((rds) => rds.id === id);
  }

  /**
   * Vedi `RdaService.caricaLista`: stessa logica online/offline/paginazione. Online, il
   * risultato va SOLO in memoria: in modalità online SQLite contiene solo le RDS non
   * ancora inviate (vedi `inviaRds`), mai i dati scaricati via GET.
   */
  async caricaLista(opts: { reset?: boolean } = {}): Promise<void> {
    if (opts.reset) {
      this.paginaCorrente.set(0);
      this.tuttiCaricati.set(false);
    }

    if (this.impostazioni.modalitaOffline() || !this.network.isOnline()) {
      await this.caricaDaDb();
      return;
    }

    if (this.tuttiCaricati() || this.isCaricandoLista()) return;

    this.isCaricandoLista.set(true);
    try {
      const pagina = this.paginaCorrente() + 1;
      const risposta = await this.api.getRds(PAGE_SIZE_LISTA, pagina);
      if (risposta.length < PAGE_SIZE_LISTA) this.tuttiCaricati.set(true);
      this.fondiRemoti(risposta, opts.reset === true);
      this.paginaCorrente.set(pagina);
    } finally {
      this.isCaricandoLista.set(false);
    }
  }

  /** Vedi `RdaService.caricaDettaglio`: fresco dal backend se online (solo in memoria), altrimenti solo cache locale. */
  async caricaDettaglio(id: string): Promise<void> {
    if (this.impostazioni.modalitaOffline() || !this.network.isOnline()) return;
    if (this.dettaglioInCorso.has(id)) return;

    this.dettaglioInCorso.add(id);
    this.isCaricandoDettaglio.set(true);
    try {
      const dettaglio = await this.api.getRdsById(id);
      const rds = this.mappaRemote(dettaglio);
      this.listaRds.update((lista) =>
        lista.some((r) => r.id === id) ? lista.map((r) => (r.id === id ? rds : r)) : [...lista, rds],
      );
    } finally {
      this.dettaglioInCorso.delete(id);
      this.isCaricandoDettaglio.set(false);
    }
  }

  /** Elimina solo le RDS non ancora sincronizzate: le DELETE verso il backend sono fuori scope. */
  async eliminaRds(id: string): Promise<void> {
    const rds = this.getById(id);
    if (!rds || rds.sincronizzato) return;

    await this.db.run('DELETE FROM rds WHERE id = ?', [id]);
    this.listaRds.update((lista) => lista.filter((r) => r.id !== id));
  }

  /** Fonde la pagina appena scaricata nel signal, senza mai toccare le bozze locali non inviate. */
  private fondiRemoti(righe: RdsListItem[], reset: boolean): void {
    const mappati = righe.map((r) => this.mappaRemote(r));
    this.listaRds.update((lista) => {
      const locali = lista.filter((r) => !r.sincronizzato);
      const remotiPrecedenti = reset ? [] : lista.filter((r) => r.sincronizzato);
      const mappa = new Map(remotiPrecedenti.map((r) => [r.id, r]));
      for (const r of mappati) mappa.set(r.id, r);
      return [...locali, ...mappa.values()];
    });
  }

  private mappaRemote(r: RdsListItem): Rds {
    return {
      id: r.uuid,
      data: r.data,
      stato: r.stato as RdaStatus,
      tipoAttrezzaturaId: r.tipoAttrezzaturaId ?? '',
      attrezzaturaId: r.attrezzaturaId ?? '',
      codArt: r.codArt ?? '',
      note: r.note ?? '',
      orariAccesso: r.orariAccesso ?? '',
      rifCliente: r.rifCliente ?? '',
      telefono: r.telefono ?? '',
      statoMezzo: (r.statoMezzo as StatoMezzo) ?? StatoMezzo.Funzionante,
      sincronizzato: true,
    };
  }

  async creaRds(input: NuovaRdsInput): Promise<Rds> {
    const nuova: Rds = {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      stato: RdaStatus.Creato,
      tipoAttrezzaturaId: input.tipoAttrezzaturaId,
      attrezzaturaId: input.attrezzaturaId,
      codArt: input.codArt,
      note: input.note,
      orariAccesso: input.orariAccesso,
      rifCliente: input.rifCliente,
      telefono: input.telefono,
      statoMezzo: input.statoMezzo,
      sincronizzato: false,
    };

    await this.salvaSuDb(nuova);
    this.listaRds.update((lista) => [...lista, nuova]);
    return nuova;
  }

  /**
   * Tenta l'invio della RDS al backend se online, altrimenti la lascia in coda (sincronizzato = false,
   * stato = DaInviare). Lo stato "Da Inviare" compare SOLO quando l'invio non è andato a buon fine
   * (offline o fallito): è quello il segnale che la richiesta è ancora solo salvata localmente.
   * Da richiamare dopo `creaRds`, e anche da "Invia tutto" per ogni RDS non ancora sincronizzata.
   */
  async inviaRds(rds: Rds): Promise<boolean> {
    if (!this.network.isOnline()) {
      await this.segnaDaInviare(rds.id);
      await this.notifica.mostraOffline();
      return false;
    }

    const inviataConSuccesso = await this.tentaInvio(rds);

    if (inviataConSuccesso) {
      if (this.impostazioni.modalitaOffline()) {
        const statoFinale = rds.stato === RdaStatus.DaInviare ? RdaStatus.Creato : rds.stato;
        await this.db.run('UPDATE rds SET sincronizzato = 1, stato = ? WHERE id = ?', [statoFinale, rds.id]);
        this.listaRds.update((lista) =>
          lista.map((r) => (r.id === rds.id ? { ...r, sincronizzato: true, stato: statoFinale } : r)),
        );
      } else {
        // Online: la tabella locale contiene solo le richieste non ancora inviate (vedi `caricaLista`),
        // quindi appena confermata dal backend la bozza esce da SQLite; ricomparirà con l'uuid server
        // alla prossima GET /rds.
        await this.db.run('DELETE FROM rds WHERE id = ?', [rds.id]);
        this.listaRds.update((lista) => lista.filter((r) => r.id !== rds.id));
      }
      await this.notifica.mostraSuccessoInvio('RDS');
    } else {
      await this.segnaDaInviare(rds.id);
      await this.notifica.mostraErroreInvio('RDS');
    }
    return inviataConSuccesso;
  }

  /** Fino a TENTATIVI_INVIO tentativi, con una breve attesa tra l'uno e l'altro, prima di arrendersi. */
  private async tentaInvio(rds: Rds): Promise<boolean> {
    const payload = toInvioRdsPayload(rds);
    for (let tentativo = 1; tentativo <= TENTATIVI_INVIO; tentativo++) {
      try {
        await this.api.postNewRds(payload);
        return true;
      } catch {
        // tentativo fallito (es. timeout/errore di rete): si ritenta finché non si esauriscono i tentativi
      }
      if (tentativo < TENTATIVI_INVIO) {
        await new Promise((resolve) => setTimeout(resolve, ATTESA_TRA_TENTATIVI_MS * tentativo));
      }
    }
    return false;
  }

  private async segnaDaInviare(id: string): Promise<void> {
    await this.db.run('UPDATE rds SET sincronizzato = 0, stato = ? WHERE id = ?', [RdaStatus.DaInviare, id]);
    this.listaRds.update((lista) =>
      lista.map((r) => (r.id === id ? { ...r, sincronizzato: false, stato: RdaStatus.DaInviare } : r)),
    );
  }

  async seedEsempi(): Promise<void> {
    const esempi: Rds[] = [
      {
        id: crypto.randomUUID(),
        data: giorniFa(0),
        stato: RdaStatus.Creato,
        tipoAttrezzaturaId: '1',
        attrezzaturaId: '1',
        codArt: 'DEC-001',
        note: 'Decespugliatore non parte, controllare candela',
        orariAccesso: 'Lun-Ven 8:00-17:00',
        rifCliente: 'Mario Rossi',
        telefono: '333 1234567',
        statoMezzo: StatoMezzo.Ferma,
        sincronizzato: false,
      },
      {
        id: crypto.randomUUID(),
        data: giorniFa(1),
        stato: RdaStatus.InAttesa,
        tipoAttrezzaturaId: '2',
        attrezzaturaId: '3',
        codArt: 'RAS-001',
        note: 'Manutenzione ordinaria di fine stagione',
        orariAccesso: 'Sabato 9:00-12:00',
        rifCliente: 'Laura Bianchi',
        telefono: '347 7654321',
        statoMezzo: StatoMezzo.Funzionante,
        sincronizzato: true,
      },
      {
        id: crypto.randomUUID(),
        data: giorniFa(3),
        stato: RdaStatus.Approvata,
        tipoAttrezzaturaId: '3',
        attrezzaturaId: '5',
        codArt: 'SPZ-001',
        note: 'Sostituzione filtro aspirazione',
        orariAccesso: 'Tutti i giorni 7:00-19:00',
        rifCliente: 'Cantiere Ness - magazzino',
        telefono: '02 12345678',
        statoMezzo: StatoMezzo.Funzionante,
        sincronizzato: true,
      },
      {
        id: crypto.randomUUID(),
        data: giorniFa(5),
        stato: RdaStatus.Rifiutata,
        tipoAttrezzaturaId: '1',
        attrezzaturaId: '2',
        codArt: 'DEC-002',
        note: 'Richiesta duplicata, già gestita con RDS precedente',
        orariAccesso: 'Mar-Gio 14:00-16:00',
        rifCliente: 'Giuseppe Verdi',
        telefono: '328 9988776',
        statoMezzo: StatoMezzo.Ferma,
        sincronizzato: true,
      },
    ];

    await this.db.run('DELETE FROM rds');
    for (const rds of esempi) {
      await this.salvaSuDb(rds);
    }
    this.listaRds.set(esempi);
  }

  private async salvaSuDb(rds: Rds): Promise<void> {
    await this.db.run(
      `INSERT INTO rds (id, data, stato, tipo_attrezzatura_id, attrezzatura_id, cod_art, note, orari_accesso, rif_cliente, telefono, stato_mezzo, sincronizzato)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rds.id,
        rds.data,
        rds.stato,
        rds.tipoAttrezzaturaId,
        rds.attrezzaturaId,
        rds.codArt,
        rds.note,
        rds.orariAccesso,
        rds.rifCliente,
        rds.telefono,
        rds.statoMezzo,
        rds.sincronizzato ? 1 : 0,
      ],
    );
  }
}
