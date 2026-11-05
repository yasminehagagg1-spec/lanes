import { execFile } from 'node:child_process';
import notifier from 'node-notifier';

export interface LanesNotification {
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string;
  sound: boolean;
}

export type Notifier = (n: LanesNotification) => Promise<void>;

/** AppleScript string literal. */
const asString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Plain macOS banner via osascript — no click action, but it always works. */
function osascriptNotify(n: LanesNotification): Promise<void> {
  const script = `display notification ${asString(n.body)} with title ${asString(n.title)}${
    n.sound ? ' sound name "Glass"' : ''
  }`;
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], () => resolve());
  });
}

/**
 * macOS Notification Center through node-notifier (terminal-notifier), which supports
 * "click opens the task". Falls back to osascript if that fails.
 */
export function macNotifier(log: (msg: string) => void = console.error): Notifier {
  return (n) =>
    new Promise((resolve) => {
      notifier.notify(
        {
          title: n.title,
          message: n.body,
          open: n.url,
          sound: n.sound ? 'Glass' : false,
          group: 'lanes',
          wait: false,
        },
        (err) => {
          if (!err) return resolve();
          log(`Notification via terminal-notifier failed (${err.message}); using osascript.`);
          void osascriptNotify(n).then(resolve);
        },
      );
    });
}

/** LANES_NOTIFY=off (tests, CI): log instead of showing banners. */
export const silentNotifier: Notifier = async () => {};

export function notifierFromEnv(env: NodeJS.ProcessEnv = process.env): Notifier {
  return env.LANES_NOTIFY === 'off' ? silentNotifier : macNotifier();
}
