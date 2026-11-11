import { computed, Injectable, signal } from '@angular/core';
import { DatabaseService, SqlRow } from './database.service';

interface BudgetData {
  totale: number;
  residuo: number;
}

export interface BudgetGruppo extends BudgetData {
  gruppoMerceologicoId: string;
  nome: string;
}

/** Budget del cantiere non legato a nessun gruppo merceologico (grumerId/codGrumer null a backend). */
export interface BudgetGenerale extends BudgetData {
  periodo: string | null;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  constructor(private readonly db: DatabaseService) {}

  readonly budgetGruppi = signal<BudgetGruppo[]>([]);
  readonly budgetGenerale = signal<BudgetGenerale | null>(null);

  readonly budget = computed<BudgetData>(() => {
    const gruppi = this.budgetGruppi();
    return {
      totale: gruppi.reduce((somma, g) => somma + g.totale, 0),
      residuo: gruppi.reduce((somma, g) => somma + g.residuo, 0),
    };
  });

  get percentualeUtilizzata(): number {
    return this.percentuale(this.budget());
  }

  percentualeGruppo(gruppo: BudgetGruppo): number {
    return this.percentuale(gruppo);
  }

  /** Popola i signal dalle tabelle SQLite; da chiamare all'avvio dell'app (vedi main.ts). */
  async caricaDaDb(): Promise<void> {
    const [gruppi, generale] = await Promise.all([
      this.db.query<SqlRow>('SELECT gruppo_merceologico_id, nome, totale, residuo FROM budget_gruppi'),
      this.db.query<SqlRow>('SELECT totale, residuo, periodo FROM budget_generale WHERE id = 1'),
    ]);

    this.budgetGruppi.set(
      gruppi.map((g) => ({
        gruppoMerceologicoId: g['gruppo_merceologico_id'] as string,
        nome: g['nome'] as string,
        totale: Number(g['totale']),
        residuo: Number(g['residuo']),
      })),
    );

    this.budgetGenerale.set(
      generale.length > 0
        ? {
            totale: Number(generale[0]['totale']),
            residuo: Number(generale[0]['residuo']),
            periodo: (generale[0]['periodo'] as string | null) ?? null,
          }
        : null,
    );
  }

  /**
   * Imposta il budget dei gruppi a partire dai dati reali del backend (/budget).
   * Il residuo non è ancora esposto dall'API: finché non viene aggiunto si assume
   * budget interamente disponibile (residuo = totale).
   */
  async impostaBudgetGruppi(
    gruppi: { gruppoMerceologicoId: string; nome: string; totale: number }[],
    persist = true,
  ): Promise<void> {
    const budgetGruppi: BudgetGruppo[] = gruppi.map((g) => ({
      gruppoMerceologicoId: g.gruppoMerceologicoId,
      nome: g.nome,
      totale: g.totale,
      residuo: g.totale,
    }));

    if (persist) {
      await this.db.run('DELETE FROM budget_gruppi');
      await this.db.transazione(
        budgetGruppi.map((g) => ({
          statement: 'INSERT INTO budget_gruppi (gruppo_merceologico_id, nome, totale, residuo) VALUES (?, ?, ?, ?)',
          values: [g.gruppoMerceologicoId, g.nome, g.totale, g.residuo],
        })),
      );
    }
    this.budgetGruppi.set(budgetGruppi);
  }

  /**
   * Budget del cantiere senza gruppo merceologico associato (righe /budget con
   * grumerId/codGrumer null). Residuo non ancora esposto dall'API: si assume
   * budget interamente disponibile (residuo = totale), come per i gruppi.
   */
  async impostaBudgetGenerale(
    budget: { totale: number; periodo: string | null } | null,
    persist = true,
  ): Promise<void> {
    const budgetGenerale: BudgetGenerale | null = budget
      ? { totale: budget.totale, residuo: budget.totale, periodo: budget.periodo }
      : null;

    if (persist) {
      if (budgetGenerale) {
        await this.db.run(
          `INSERT INTO budget_generale (id, totale, residuo, periodo) VALUES (1, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET totale = excluded.totale, residuo = excluded.residuo, periodo = excluded.periodo`,
          [budgetGenerale.totale, budgetGenerale.residuo, budgetGenerale.periodo],
        );
      } else {
        await this.db.run('DELETE FROM budget_generale WHERE id = 1');
      }
    }
    this.budgetGenerale.set(budgetGenerale);
  }

  private percentuale({ totale, residuo }: BudgetData): number {
    if (totale <= 0) return 0;
    return Math.round(((totale - residuo) / totale) * 100);
  }
}
