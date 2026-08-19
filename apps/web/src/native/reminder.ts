import { LocalNotifications } from '@capacitor/local-notifications';

import { isNative } from './platform';

/**
 * The optional daily study reminder.
 *
 * ## Everything about this is off by default
 *
 * No permission is requested at launch. No permission is requested when the
 * learner opens Settings. The system prompt appears at exactly one moment: the
 * learner has turned the reminder on and chosen a time, which is the only point
 * at which "allow notifications?" is a question they have already answered.
 *
 * That ordering is the whole design. An app that asks for notification
 * permission on first launch is asking before it has earned anything, and the
 * learner's only information is that this app wants to interrupt them.
 *
 * ## What it is not
 *
 * There is no server, so there is no push. Nothing is scheduled anywhere but on
 * the device, nothing is sent to anyone, and nothing about the learner leaves
 * the phone in order to make it work — the notification is a local alarm the
 * app sets on itself.
 *
 * And it is one reminder, at one time, saying one thing. No streak-loss
 * warnings, no "we miss you", no re-engagement campaign. A paid product that
 * has already been bought has nothing to sell the person who bought it, and the
 * only honest reason to interrupt them is the one they asked for.
 */

/**
 * The id every scheduled reminder uses.
 *
 * A constant rather than a generated one: there is only ever one reminder, and
 * rescheduling has to replace it rather than accumulate a new alarm every time
 * the learner nudges the time by five minutes.
 */
const REMINDER_ID = 1;

export interface ReminderState {
  /** Whether the platform can do this at all. False in a browser. */
  available: boolean;
  /** Whether the learner has been asked, and what they said. */
  permission: 'granted' | 'denied' | 'unasked';
  /** `HH:mm`, or null when the reminder is off. */
  at: string | null;
}

export async function reminderState(): Promise<ReminderState> {
  if (!isNative) return { available: false, permission: 'unasked', at: null };
  try {
    const [{ display }, { notifications }] = await Promise.all([
      LocalNotifications.checkPermissions(),
      LocalNotifications.getPending(),
    ]);
    const pending = notifications.find((n) => n.id === REMINDER_ID);
    const on = pending?.schedule?.on;
    return {
      available: true,
      permission:
        display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'unasked',
      at:
        on && on.hour !== undefined
          ? `${String(on.hour).padStart(2, '0')}:${String(on.minute ?? 0).padStart(2, '0')}`
          : null,
    };
  } catch {
    // A platform that has the plugin compiled in but refuses the call is
    // indistinguishable from one that does not have it. Either way the setting
    // is not offered.
    return { available: false, permission: 'unasked', at: null };
  }
}

/**
 * Turns the reminder on at `HH:mm`, asking permission if this is the first time.
 *
 * Returns false when permission was refused, so the caller can leave the switch
 * off rather than showing it on and silently never firing — a toggle that lies
 * about its own state is worse than a feature that is unavailable.
 */
export async function enableReminder(
  at: string,
  copy: { title: string; body: string },
): Promise<boolean> {
  if (!isNative) return false;
  const [hour, minute] = at.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      // Here, and nowhere else. See the note at the top of this file.
      ({ display } = await LocalNotifications.requestPermissions());
    }
    if (display !== 'granted') return false;

    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: copy.title,
          body: copy.body,
          // `repeats` with an `on` of hour and minute is a daily alarm. No end
          // date: the learner turns it off, the app does not decide for them.
          schedule: { on: { hour: hour!, minute: minute! }, repeats: true, allowWhileIdle: false },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

export async function disableReminder(): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* nothing scheduled, or the platform refused; either way it is off */
  }
}
