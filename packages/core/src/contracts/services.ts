import type { EventBus } from './events';
import type { Account } from './types';

export interface AccountsService {
  current(): Account | null;
  signIn(input: { jid: string; password: string; remember: boolean }): Promise<Account>;
  signOut(): Promise<void>;
  rememberedPassword(jid: string): Promise<string | null>;
}

export interface Core {
  accounts: AccountsService;
  events: EventBus;
}
