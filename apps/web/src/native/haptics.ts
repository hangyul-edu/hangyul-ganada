import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { isNative } from './platform';

/**
 * The physical half of the app's feedback.
 *
 * Handwriting practice is the one place in Hangyul ganada where a learner is
 * looking at their own hand and not at the screen. They finish a stroke, they
 * lift the pen, and for a moment the result is somewhere they are not looking.
 * A tap they can feel closes that gap before their eyes get back to the card —
 * which is the whole reason this exists, and also the reason it is used
 * sparingly. Vibration on every interaction stops carrying information and
 * becomes noise the learner turns off in system settings, taking the useful
 * signals with it.
 *
 * So: three moments, and nothing else.
 *
 * * A character passed — a success notification, the platform's own "done".
 * * A character needs another try — a warning, distinctly different in the
 *   hand from success, which matters when the screen is not being watched.
 * * A choice was registered — the lightest available tap, for the pickers where
 *   the visual change is a small one.
 *
 * Every call is a no-op in a browser and on a device with haptics disabled or
 * absent. None of them are awaited by callers and none of them can fail loudly:
 * a phone that will not vibrate is not a reason for a lesson to stop.
 */

async function safely(action: () => Promise<unknown>): Promise<void> {
  if (!isNative) return;
  try {
    await action();
  } catch {
    /* No haptic engine, or the system is suppressing it. Not our problem. */
  }
}

/** The attempt was accepted. */
export function hapticPass(): void {
  void safely(() => Haptics.notification({ type: NotificationType.Success }));
}

/** The attempt needs another go. Not a failure — a nudge. */
export function hapticRetry(): void {
  void safely(() => Haptics.notification({ type: NotificationType.Warning }));
}

/** A selection landed: a font, a voice, a language. */
export function hapticSelection(): void {
  void safely(() => Haptics.impact({ style: ImpactStyle.Light }));
}
