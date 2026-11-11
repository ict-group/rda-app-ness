import { Injectable, signal } from '@angular/core';
import { NuovaRdaInput, Rda, RdaStatus, RigaRda } from '../models/rda.model';
import { RdaListItem } from '../models/rda-mobile.model';
import { InvioRdaPayload } from '../models/invio-rda.model';
import { DatabaseService, SqlRow } from './database.service';
import { NetworkService } from './network.service';
import { NotificaErroriService } from './notifica-errori.service';
import { RdaMobileApiService } from './rda-mobile-api.service';
import { AnagraficheService } from './anagrafiche.service';
import { ImpostazioniService } from './impostazioni.service';

const TENTATIVI_INVIO = 3;
const ATTESA_TRA_TENTATIVI_MS = 1000;
const PAGE_SIZE_LISTA = 30;

function giorniFa(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function dataConsegnaTraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function rigaEsempio(
  articoloId: string,
  codice: string,
  nome: string,
  quantita: number,
  prezzo: number,
  gruppoMerceologicoId: string,
): RigaRda {
  return {
    id: crypto.randomUUID(),
    articoloId,
    codice,
    nome,
    um: 'PZ',
    quantita,
    prezzo,
    importo: prezzo * quantita,
    gruppoMerceologicoId,
  };
}

@Injectable({ providedIn: 'root' })
export class RdaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly network: NetworkService,
    private readonly notifica: NotificaErroriService,
    private readonly api: RdaMobileApiService,
    private readonly anagrafiche: AnagraficheService,
    private readonly impostazioni: ImpostazioniService,
  ) {}

  readonly listaRda = signal<Rda[]>([]);
  readonly paginaCorrente = signal(0);
  readonly tuttiCaricati = signal(false);
  readonly isCaricandoLista = signal(false);

  /** Evita dettagli duplicati in parallelo per la stessa RDA (es. doppio tap, o pagine che si sovrappongono). */
  private readonly dettaglioInCorso = new Set<string>();
  /** Per lo skeleton in dettaglio-rda.page durante `caricaDettaglio`. */
  readonly isCaricandoDettaglio = signal(false);

  get ultimeRda(): Rda[] {
    return [...this.listaRda()]
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 5);
  }

  /** Popola il signal dalla tabella SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const righeRda = await this.db.query<SqlRow>('SELECT * FROM rda');
    const righeRighe = await this.db.query<SqlRow>('SELECT * FROM rda_righe');

    const righePerRda = new Map<string, RigaRda[]>();
    for (const r of righeRighe) {
      const rdaId = r['rda_id'] as string;
      const riga: RigaRda = {
        id: r['id'] as string,
        articoloId: r['articolo_id'] as string,
        codice: r['codice'] as string,
        nome: r['nome'] as string,
        um: r['um'] as string,
        quantita: Number(r['quantita']),
        prezzo: Number(r['prezzo']),
        importo: Number(r['importo']),
        gruppoMerceologicoId: r['gruppo_merceologico_id'] as string,
      };
      righePerRda.set(rdaId, [...(righePerRda.get(rdaId) ?? []), riga]);
    }

    const lista: Rda[] = righeRda.map((r) => ({
      id: r['id'] as string,
      descrizione: r['descrizione'] as string,
      importo: Number(r['importo']),
      data: r['data'] as string,
      dataCreazione: r['data_creazione'] as string,
      stato: r['stato'] as RdaStatus,
      cantiereId: (r['cantiere_id'] as string | null) ?? undefined,
      gruppoMerceologicoId: (r['gruppo_merceologico_id'] as string | null) ?? undefined,
      businessUnit: (r['business_unit'] as string | null) ?? undefined,
      righe: righePerRda.get(r['id'] as string) ?? [],
      sincronizzato: Number(r['sincronizzato']) === 1,
    }));

    this.listaRda.set(lista);
  }

  getById(id: string): Rda | undefined {
    return this.listaRda().find((rda) => rda.id === id);
  }

  /**
   * Da chiamare all'apertura di lista-rda (reset: true) e per lo scroll infinito (reset: false).
   * In modalità offline, o senza rete in questo momento, si limita a rileggere SQLite (dove in
   * modalità online restano solo le bozze non ancora inviate: vedi `inviaRda`). Online, scarica
   * la pagina richiesta e la fonde SOLO in memoria (nessuna scrittura su SQLite: il dato arriva
   * comunque fresco ad ogni apertura pagina, scriverlo ogni volta rallenterebbe solo l'app).
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

    // Home e lista-rda possono chiamarla quasi insieme: se una chiamata è già in corso,
    // questa seconda non ne parte un'altra in parallelo (su rete scarsa raddoppierebbe solo l'attesa).
    if (this.tuttiCaricati() || this.isCaricandoLista()) return;

    this.isCaricandoLista.set(true);
    try {
      const pagina = this.paginaCorrente() + 1;
      const risposta = await this.api.getRdas(PAGE_SIZE_LISTA, pagina);
      if (risposta.length < PAGE_SIZE_LISTA) this.tuttiCaricati.set(true);
      this.fondiRemoti(risposta, opts.reset === true);
      this.paginaCorrente.set(pagina);
    } finally {
      this.isCaricandoLista.set(false);
    }
  }

  /** Dettaglio sempre fresco dal backend se online (testata + righe), solo in memoria; altrimenti usa solo la cache locale. */
  async caricaDettaglio(id: string): Promise<void> {
    if (this.impostazioni.modalitaOffline() || !this.network.isOnline()) return;
    if (this.dettaglioInCorso.has(id)) return;

    this.dettaglioInCorso.add(id);
    this.isCaricandoDettaglio.set(true);
    try {
      const [testata, righeRemote] = await Promise.all([this.api.getRdaById(id), this.api.getRdaRows(id)]);
      const rda = this.mappaRemote(testata);
      rda.righe = righeRemote.map((riga) => ({
        id: riga.uuid,
        articoloId: riga.codArt,
        codice: riga.codArt,
        nome: riga.articolo ?? riga.codArt,
        um: 'PZ',
        quantita: riga.quantita,
        prezzo: riga.prezzo ?? 0,
        importo: (riga.prezzo ?? 0) * riga.quantita,
        gruppoMerceologicoId: riga.grumerId != null ? String(riga.grumerId) : '',
      }));

      this.listaRda.update((lista) =>
        lista.some((r) => r.id === id) ? lista.map((r) => (r.id === id ? rda : r)) : [...lista, rda],
      );
    } finally {
      this.dettaglioInCorso.delete(id);
      this.isCaricandoDettaglio.set(false);
    }
  }

  /** Elimina solo le RDA non ancora sincronizzate: le DELETE verso il backend sono fuori scope. */
  async eliminaRda(id: string): Promise<void> {
    const rda = this.getById(id);
    if (!rda || rda.sincronizzato) return;

    await this.db.run('DELETE FROM rda_righe WHERE rda_id = ?', [id]);
    await this.db.run('DELETE FROM rda WHERE id = ?', [id]);
    this.listaRda.update((lista) => lista.filter((r) => r.id !== id));
  }

  /** Fonde la pagina appena scaricata nel signal, senza mai toccare le bozze locali non inviate. */
  private fondiRemoti(righe: RdaListItem[], reset: boolean): void {
    const mappati = righe.map((r) => this.mappaRemote(r));
    this.listaRda.update((lista) => {
      const locali = lista.filter((r) => !r.sincronizzato);
      const remotiPrecedenti = reset ? [] : lista.filter((r) => r.sincronizzato);
      const mappa = new Map(remotiPrecedenti.map((r) => [r.id, r]));
      for (const r of mappati) mappa.set(r.id, r);
      return [...locali, ...mappa.values()];
    });
  }

  private mappaRemote(r: RdaListItem): Rda {
    return {
      id: r.uuid,
      descrizione: r.descrizione ?? '',
      importo: r.importo ?? 0,
      data: r.dataConsegna,
      dataCreazione: r.dataCreazione ?? r.dataConsegna,
      stato: r.stato as RdaStatus,
      cantiereId: r.codCantiere ?? undefined,
      gruppoMerceologicoId: r.codGrumer ?? undefined,
      businessUnit: r.codBu ?? undefined,
      righe: [],
      sincronizzato: true,
    };
  }

  async creaRda(input: NuovaRdaInput): Promise<Rda> {
    const nuova: Rda = {
      id: crypto.randomUUID(),
      descrizione: input.nota,
      importo: input.righe.reduce((totale, riga) => totale + riga.importo, 0),
      data: input.dataConsegna,
      dataCreazione: new Date().toISOString(),
      stato: RdaStatus.Creato,
      cantiereId: input.cantiereId,
      gruppoMerceologicoId: input.gruppoMerceologicoId,
      businessUnit: input.businessUnit,
      righe: input.righe,
      sincronizzato: false,
    };

    await this.salvaSuDb(nuova);
    this.listaRda.update((lista) => [...lista, nuova]);
    return nuova;
  }

  /**
   * Tenta l'invio della RDA al backend se online, altrimenti la lascia in coda (sincronizzato = false,
   * stato = DaInviare). Lo stato "Da Inviare" compare SOLO quando l'invio non è andato a buon fine
   * (offline o fallito): è quello il segnale che la richiesta è ancora solo salvata localmente.
   * Da richiamare dopo `creaRda`, e anche da "Invia tutto" per ogni RDA non ancora sincronizzata.
   */
  async inviaRda(rda: Rda): Promise<boolean> {
    if (!this.network.isOnline()) {
      await this.segnaDaInviare(rda.id);
      await this.notifica.mostraOffline();
      return false;
    }

    const inviataConSuccesso = await this.tentaInvio(rda);

    if (inviataConSuccesso) {
      if (this.impostazioni.modalitaOffline()) {
        // Se era rimasta in coda come "Da Inviare" da un tentativo precedente, torna a uno stato normale.
        const statoFinale = rda.stato === RdaStatus.DaInviare ? RdaStatus.Creato : rda.stato;
        await this.db.run('UPDATE rda SET sincronizzato = 1, stato = ? WHERE id = ?', [statoFinale, rda.id]);
        this.listaRda.update((lista) =>
          lista.map((r) => (r.id === rda.id ? { ...r, sincronizzato: true, stato: statoFinale } : r)),
        );
      } else {
        // Online: la tabella locale contiene solo le richieste non ancora inviate (vedi `caricaLista`),
        // quindi appena confermata dal backend la bozza esce da SQLite; ricomparirà con l'uuid server
        // alla prossima GET /rdas.
        await this.db.run('DELETE FROM rda_righe WHERE rda_id = ?', [rda.id]);
        await this.db.run('DELETE FROM rda WHERE id = ?', [rda.id]);
        this.listaRda.update((lista) => lista.filter((r) => r.id !== rda.id));
      }
      await this.notifica.mostraSuccessoInvio('RDA');
    } else {
      await this.segnaDaInviare(rda.id);
      await this.notifica.mostraErroreInvio('RDA');
    }
    return inviataConSuccesso;
  }

  /** Fino a TENTATIVI_INVIO tentativi, con una breve attesa tra l'uno e l'altro, prima di arrendersi. */
  private async tentaInvio(rda: Rda): Promise<boolean> {
    const payload = this.toPayload(rda);
    for (let tentativo = 1; tentativo <= TENTATIVI_INVIO; tentativo++) {
      try {
        await this.api.postNewRda(payload);
        return true;
      } catch {
        // tentativo fallito (es. timeout/errore di rete, o 400 se un articolo non ha un grumerId
        // valido): si ritenta finché non si esauriscono i tentativi
      }
      if (tentativo < TENTATIVI_INVIO) {
        await new Promise((resolve) => setTimeout(resolve, ATTESA_TRA_TENTATIVI_MS * tentativo));
      }
    }
    return false;
  }

  private toPayload(rda: Rda): InvioRdaPayload {
    const gruppi = this.anagrafiche.gruppiMerceologici();
    return {
      codCantiere: rda.cantiereId ?? '',
      codBu: rda.businessUnit ?? '',
      dataConsegna: rda.data,
      nota: rda.descrizione,
      righe: (rda.righe ?? []).map((riga) => ({
        codArt: riga.codice,
        quantita: riga.quantita,
        grumerId: gruppi.find((g) => g.id === riga.gruppoMerceologicoId)?.grumerId,
      })),
    };
  }

  private async segnaDaInviare(id: string): Promise<void> {
    await this.db.run('UPDATE rda SET sincronizzato = 0, stato = ? WHERE id = ?', [RdaStatus.DaInviare, id]);
    this.listaRda.update((lista) =>
      lista.map((r) => (r.id === id ? { ...r, sincronizzato: false, stato: RdaStatus.DaInviare } : r)),
    );
  }

  async seedEsempi(): Promise<void> {
    const righe1 = [
      rigaEsempio('2', 'INTRA-SCOTCH01', 'Scotch da pacco', 10, 1.25, '1'),
      rigaEsempio('3', 'INTRA-CART50', 'Cartoni 50%', 20, 0.95, '1'),
    ];
    const righe2 = [rigaEsempio('1', 'IGR-CARIG01', 'Carta igienica', 4, 18.5, '2')];
    const righe3 = [
      rigaEsempio('4', 'INTRA-RAYSENSIL', 'Guanti nitrile senza polvere', 15, 3.5, '2'),
      rigaEsempio('5', 'INTRA-EUSCO008', 'Scopa nylon per interni', 3, 1.25, '2'),
    ];
    const righe4 = [rigaEsempio('2', 'INTRA-SCOTCH01', 'Scotch da pacco', 50, 1.25, '1')];
    const righe5 = [rigaEsempio('1', 'IGR-CARIG01', 'Carta igienica', 2, 18.5, '2')];
    const righe6 = [
      rigaEsempio('3', 'INTRA-CART50', 'Cartoni 50%', 8, 0.95, '1'),
      rigaEsempio('4', 'INTRA-RAYSENSIL', 'Guanti nitrile senza polvere', 6, 3.5, '2'),
    ];

    const esempi: Rda[] = [
      {
        id: crypto.randomUUID(),
        descrizione: 'Materiale imballaggio magazzino',
        importo: righe1.reduce((t, r) => t + r.importo, 0),
        data: dataConsegnaTraGiorni(4),
        dataCreazione: giorniFa(1),
        stato: RdaStatus.Creato,
        cantiereId: '1',
        gruppoMerceologicoId: '1',
        businessUnit: 'Pulizie',
        righe: righe1,
        sincronizzato: false,
      },
      {
        id: crypto.randomUUID(),
        descrizione: 'Carta igienica uffici',
        importo: righe2.reduce((t, r) => t + r.importo, 0),
        data: dataConsegnaTraGiorni(2),
        dataCreazione: giorniFa(2),
        stato: RdaStatus.InAttesa,
        cantiereId: '1',
        gruppoMerceologicoId: '2',
        businessUnit: 'Pulizie',
        righe: righe2,
        sincronizzato: true,
      },
      {
        id: crypto.randomUUID(),
        descrizione: 'DPI squadra giardinaggio',
        importo: righe3.reduce((t, r) => t + r.importo, 0),
        data: dataConsegnaTraGiorni(7),
        dataCreazione: giorniFa(3),
        stato: RdaStatus.Approvata,
        cantiereId: '1',
        gruppoMerceologicoId: '2',
        businessUnit: 'Giardinaggio',
        righe: righe3,
        sincronizzato: true,
      },
      {
        id: crypto.randomUUID(),
        descrizione: 'Scotch imballo extra',
        importo: righe4.reduce((t, r) => t + r.importo, 0),
        data: dataConsegnaTraGiorni(10),
        dataCreazione: giorniFa(4),
        stato: RdaStatus.Rifiutata,
        cantiereId: '1',
        gruppoMerceologicoId: '1',
        businessUnit: 'Derattizzazione',
        righe: righe4,
        sincronizzato: true,
      },
      {
        id: crypto.randomUUID(),
        descrizione: 'Carta igienica reception',
        importo: righe5.reduce((t, r) => t + r.importo, 0),
        data: dataConsegnaTraGiorni(1),
        dataCreazione: giorniFa(5),
        stato: RdaStatus.Creato,
        cantiereId: '1',
        gruppoMerceologicoId: '2',
        businessUnit: 'Pulizie',
        righe: righe5,
        sincronizzato: false,
      },
      {
        id: crypto.randomUUID(),
        descrizione: 'Rifornimento cartoni e guanti',
        importo: righe6.reduce((t, r) => t + r.importo, 0),
        data: dataConsegnaTraGiorni(6),
        dataCreazione: giorniFa(6),
        stato: RdaStatus.Approvata,
        cantiereId: '1',
        gruppoMerceologicoId: '1',
        businessUnit: 'Giardinaggio',
        righe: righe6,
        sincronizzato: true,
      },
    ];

    await this.db.run('DELETE FROM rda');
    await this.db.run('DELETE FROM rda_righe');
    for (const rda of esempi) {
      await this.salvaSuDb(rda);
    }
    this.listaRda.set(esempi);
  }

  private async salvaSuDb(rda: Rda): Promise<void> {
    await this.db.run(
      `INSERT INTO rda (id, descrizione, importo, data, data_creazione, stato, cantiere_id, gruppo_merceologico_id, business_unit, sincronizzato)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rda.id,
        rda.descrizione,
        rda.importo,
        rda.data,
        rda.dataCreazione,
        rda.stato,
        rda.cantiereId ?? null,
        rda.gruppoMerceologicoId ?? null,
        rda.businessUnit ?? null,
        rda.sincronizzato ? 1 : 0,
      ],
    );

    const righe = rda.righe ?? [];
    if (righe.length > 0) {
      await this.db.transazione(
        righe.map((riga) => ({
          statement: `INSERT INTO rda_righe (id, rda_id, articolo_id, codice, nome, um, quantita, prezzo, importo, gruppo_merceologico_id)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            riga.id,
            rda.id,
            riga.articoloId,
            riga.codice,
            riga.nome,
            riga.um,
            riga.quantita,
            riga.prezzo,
            riga.importo,
            riga.gruppoMerceologicoId,
          ],
        })),
      );
    }
  }
}
