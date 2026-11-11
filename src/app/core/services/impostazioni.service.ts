import { Injectable, signal } from '@angular/core';
import { DatabaseService, SqlRow } from './database.service';

/**
 * Flag utente "Modalità offline" (tab Configurazione). Di default l'app lavora online
 * (chiamate REST on-demand); se attivato, torna al comportamento storico: dati scaricati
 * in blocco e letti da SQLite, nessuna chiamata automatica per le liste RDA/RDS.
 */
@Injectable({ providedIn: 'root' })
export class ImpostazioniService {
  constructor(private readonly db: DatabaseService) {}

  readonly modalitaOffline = signal(false);

  /** Popola il signal dalla tabella SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const righe = await this.db.query<SqlRow>('SELECT modalita_offline FROM impostazioni WHERE id = 1');
    this.modalitaOffline.set(righe.length > 0 ? Number(righe[0]['modalita_offline']) === 1 : false);
  }

  async impostaModalitaOffline(valore: boolean): Promise<void> {
    await this.db.run(
      `INSERT INTO impostazioni (id, modalita_offline) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET modalita_offline = excluded.modalita_offline`,
      [valore ? 1 : 0],
    );
    this.modalitaOffline.set(valore);
  }
}
