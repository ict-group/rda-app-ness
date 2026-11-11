import { Injectable, signal } from '@angular/core';
import { DatabaseService, SqlRow } from './database.service';
import { NetworkService } from './network.service';
import { RdaService } from './rda.service';
import { RdsService } from './rds.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  constructor(
    private readonly db: DatabaseService,
    private readonly network: NetworkService,
    private readonly rdaService: RdaService,
    private readonly rdsService: RdsService,
  ) {}

  readonly lastSync = signal<string | null>(null);
  readonly pendingCount = signal<number>(0);
  readonly isSyncing = signal<boolean>(false);
  readonly isInviando = signal<boolean>(false);

  /** Popola i signal dalla tabella SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const righe = await this.db.query<SqlRow>('SELECT ultima_sincronizzazione FROM sync_meta WHERE id = 1');
    this.lastSync.set(righe.length > 0 ? (righe[0]['ultima_sincronizzazione'] as string | null) : null);
    await this.aggiornaPendingCount();
  }

  async sincronizzaOra(): Promise<void> {
    this.isSyncing.set(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO sync_meta (id, ultima_sincronizzazione) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET ultima_sincronizzazione = excluded.ultima_sincronizzazione`,
      [now],
    );
    this.lastSync.set(now);
    this.isSyncing.set(false);
  }

  /**
   * Invia tutte le RDA e RDS non ancora sincronizzate (coda offline). Se non c'è
   * connessione non fa nulla: i record restano in coda per il prossimo tentativo.
   */
  async inviaTutti(): Promise<void> {
    if (!this.network.isOnline()) return;

    this.isInviando.set(true);
    try {
      const rdaDaInviare = this.rdaService.listaRda().filter((r) => !r.sincronizzato);
      const rdsDaInviare = this.rdsService.listaRds().filter((r) => !r.sincronizzato);

      for (const rda of rdaDaInviare) {
        await this.rdaService.inviaRda(rda);
      }
      for (const rds of rdsDaInviare) {
        await this.rdsService.inviaRds(rds);
      }

      await this.aggiornaPendingCount();
    } finally {
      this.isInviando.set(false);
    }
  }

  async aggiornaPendingCount(): Promise<void> {
    const [rda] = await this.db.query<SqlRow>('SELECT COUNT(*) as n FROM rda WHERE sincronizzato = 0');
    const [rds] = await this.db.query<SqlRow>('SELECT COUNT(*) as n FROM rds WHERE sincronizzato = 0');
    this.pendingCount.set(Number(rda?.['n'] ?? 0) + Number(rds?.['n'] ?? 0));
  }
}
