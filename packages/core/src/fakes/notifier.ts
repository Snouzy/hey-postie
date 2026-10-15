import type { Notifier } from '../contracts/repositories';

type Notification = Parameters<Notifier['show']>[0];

export class FakeNotifier implements Notifier {
  readonly shown: Notification[] = [];

  async show(input: Notification): Promise<void> {
    this.shown.push(input);
  }
}
