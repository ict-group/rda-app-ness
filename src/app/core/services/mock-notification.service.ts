import { Injectable, signal } from '@angular/core';

export interface MockNotification {
  titolo: string;
  messaggio: string;
}

@Injectable({ providedIn: 'root' })
export class MockNotificationService {
  readonly notifica = signal<MockNotification | null>(null);

  private timeoutId?: ReturnType<typeof setTimeout>;

  mostra(notifica: MockNotification, durataMs = 4000): void {
    clearTimeout(this.timeoutId);
    this.notifica.set(notifica);
    this.timeoutId = setTimeout(() => this.nascondi(), durataMs);
  }

  nascondi(): void {
    clearTimeout(this.timeoutId);
    this.notifica.set(null);
  }
}
