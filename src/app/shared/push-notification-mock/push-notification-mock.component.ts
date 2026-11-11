import { Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { MockNotificationService } from '../../core/services/mock-notification.service';

@Component({
  selector: 'app-push-notification-mock',
  templateUrl: 'push-notification-mock.component.html',
  styleUrls: ['push-notification-mock.component.scss'],
  imports: [IonIcon],
})
export class PushNotificationMockComponent {
  readonly mockNotificationService = inject(MockNotificationService);

  chiudi(): void {
    this.mockNotificationService.nascondi();
  }
}
