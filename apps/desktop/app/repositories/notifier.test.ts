import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(async () => true),
  requestPermission: vi.fn(async () => 'granted'),
  sendNotification: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-notification', () => plugin);

const { notificationSound, TauriNotifier } = await import('./notifier');

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/140.0';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15';

describe('notificationSound', () => {
  it("names each system's default sound", () => {
    expect(notificationSound(MAC)).toBe('NSUserNotificationDefaultSoundName');
    expect(notificationSound(WINDOWS)).toBe('Default');
    expect(notificationSound(LINUX)).toBe('message-new-instant');
  });
});

describe('TauriNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the notification with a sound and the chat id', async () => {
    await new TauriNotifier().show({ title: 'bob', body: 'hello', chatId: 'bob@x.org' });
    expect(plugin.sendNotification).toHaveBeenCalledWith({
      title: 'bob',
      body: 'hello',
      sound: notificationSound(navigator.userAgent),
      extra: { chatId: 'bob@x.org' },
    });
  });

  it('stays silent when the permission is refused', async () => {
    plugin.isPermissionGranted.mockResolvedValueOnce(false);
    plugin.requestPermission.mockResolvedValueOnce('denied');
    await new TauriNotifier().show({ title: 'bob', body: 'hello', chatId: 'bob@x.org' });
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });
});
