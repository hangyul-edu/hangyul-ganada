/**
 * Getting the backup out of the app, and a chosen file back in.
 *
 * `backup.ts` produces and consumes JSON; this is the ten lines around it that
 * differ between a browser tab and a store app, kept here so nothing in the UI
 * has to know which one it is running in.
 *
 * ## Why the app cannot just download it
 *
 * In a browser, a blob URL and an `<a download>` is the whole feature. Inside
 * the Android WebView it is nothing at all: Capacitor registers no
 * `DownloadListener`, so a download the page starts is dropped without an error
 * — the learner taps *Back up*, nothing happens, and the app has silently lied
 * about the one thing standing between them and losing their practice. Hence
 * the native branch: write the file, then hand it to the system share sheet so
 * the learner puts it wherever they actually keep things.
 *
 * Reading a file back needs no branch. `<input type="file">` works in the
 * WebView because Capacitor's `BridgeWebChromeClient` implements
 * `onShowFileChooser`, and it opens the platform's own picker on every target.
 *
 * The branch is on the plugins being *present*, per `native/platform.ts` — a
 * build where the share plugin failed to install falls back to the download
 * rather than throwing at a learner.
 */

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { hasPlugin, isNative } from '../native/platform';

/** How the file left the app, so the confirmation can say the true thing. */
export type BackupDelivery = 'shared' | 'downloaded';

function canShareFiles(): boolean {
  return isNative && hasPlugin('Filesystem') && hasPlugin('Share');
}

/**
 * Writes the backup somewhere the learner keeps files.
 *
 * The native path writes to the cache directory first because that is the one
 * place the app can always write without asking for a storage permission; the
 * share sheet then copies it wherever the learner chooses, and the cache copy
 * is the system's to reclaim. Asking for a storage permission to save a file
 * the learner explicitly asked to save is a dialog with no purpose.
 */
export async function saveBackupFile(json: string, filename: string): Promise<BackupDelivery> {
  if (canShareFiles()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ files: [written.uri] });
    return 'shared';
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    /*
     * Revoked on the next frame, not immediately: Safari has not started
     * reading the blob by the time `click()` returns, and revoking first gives
     * a silently empty file.
     */
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }
  return 'downloaded';
}

/**
 * Opens the platform's file picker and reads what was chosen.
 *
 * Resolves to `null` when the learner cancels — a cancelled picker is a
 * decision, not an error, and the UI says nothing at all in that case. The
 * `accept` hint is advisory on every platform, which is exactly why
 * `readBackup` validates rather than trusting the extension.
 */
export function openBackupFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.append(input);

    const finish = (result: { name: string; text: string } | null) => {
      input.remove();
      resolve(result);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      file
        .text()
        .then((text) => finish({ name: file.name, text }))
        /*
         * An unreadable file resolves as an empty one rather than rejecting:
         * `readBackup('')` already has copy for a file that is not a backup,
         * and a learner who picked something odd off a cloud drive needs that
         * sentence, not an exception.
         */
        .catch(() => finish({ name: file.name, text: '' }));
    });
    /*
     * Cancel is not observable through `change` — the picker simply never fires
     * it. `cancel` is supported everywhere the app runs; where it is not, the
     * hidden input is collected with the page and nothing is left behind.
     */
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}
