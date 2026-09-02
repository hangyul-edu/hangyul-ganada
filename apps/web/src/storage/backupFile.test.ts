import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ten lines that differ between a browser tab and the store app.
 *
 * Worth its own suite for one reason: the native path cannot be exercised by
 * anything else in this repo, and it is the path the paid product runs. A
 * download started from the page is silently dropped inside the Android
 * WebView — Capacitor registers no `DownloadListener` — so *the branch itself*
 * is the feature, and a regression that took the browser path on a phone would
 * look exactly like a button that does nothing.
 */

const platform = vi.hoisted(() => ({ isNative: false, plugins: new Set<string>() }));
const native = vi.hoisted(() => ({
  written: null as { path: string; data: string } | null,
  shared: null as { files: string[] } | null,
}));

vi.mock('../native/platform', () => ({
  get isNative() {
    return platform.isNative;
  },
  hasPlugin: (name: string) => platform.plugins.has(name),
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      native.written = { path, data };
      return { uri: `file:///cache/${path}` };
    }),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(async (options: { files: string[] }) => {
      native.shared = options;
    }),
  },
}));

const { openBackupFile, saveBackupFile } = await import('./backupFile');

/**
 * jsdom implements neither `URL.createObjectURL` nor `URL.revokeObjectURL`, and
 * the revoke runs a frame *after* the call being tested returns — so the stub
 * has to outlive the test that triggered it. Stubbed for the whole file, and
 * recorded, rather than installed and torn down per test.
 */
const objectUrls = { created: [] as string[], revoked: [] as string[] };

beforeEach(() => {
  platform.isNative = false;
  platform.plugins = new Set();
  native.written = null;
  native.shared = null;
  objectUrls.created = [];
  objectUrls.revoked = [];
  URL.createObjectURL = () => {
    const url = `blob:${objectUrls.created.length}`;
    objectUrls.created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    objectUrls.revoked.push(url);
  };
});

describe('saving in a browser', () => {
  it('downloads the file under the name it was given', async () => {
    // jsdom has no layout, so a click on a download anchor is a no-op rather
    // than an error — what is asserted is the anchor the browser was handed.
    const clicked: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });

    const how = await saveBackupFile('{"format":"x"}', 'learning-2026-09-03.json');

    expect(how).toBe('downloaded');
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('learning-2026-09-03.json');
    expect(clicked[0]!.href).toBe('blob:0');
    expect(objectUrls.created).toEqual(['blob:0']);
    // Removed from the document again: a settings screen that accumulates one
    // orphan anchor per save is a leak nobody would ever notice.
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
  });
});

describe('saving inside the app', () => {
  it('writes the file and hands it to the share sheet', async () => {
    platform.isNative = true;
    platform.plugins = new Set(['Filesystem', 'Share']);

    const how = await saveBackupFile('{"format":"x"}', 'learning-2026-09-03.json');

    expect(how).toBe('shared');
    expect(native.written).toEqual({ path: 'learning-2026-09-03.json', data: '{"format":"x"}' });
    expect(native.shared).toEqual({ files: ['file:///cache/learning-2026-09-03.json'] });
  });

  it('falls back to the download when a plugin is missing rather than throwing', async () => {
    /*
     * A build that shipped without the share plugin should degrade to the
     * browser behaviour — which does nothing useful in the WebView, but does
     * nothing *visible* either, and is preferable to an unhandled rejection in
     * front of a learner. The capability is asked about rather than assumed;
     * this is the case that asking exists for.
     */
    platform.isNative = true;
    platform.plugins = new Set(['Filesystem']);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await expect(saveBackupFile('{}', 'x.json')).resolves.toBe('downloaded');
    expect(native.shared).toBeNull();

    click.mockRestore();
  });
});

describe('picking a file', () => {
  it('reads what was chosen', async () => {
    const pending = openBackupFile();
    const input = document.querySelector('input[type="file"]')!;
    // jsdom's `File` has no `text()`, so the picked file is the shape the
    // adapter actually uses: a name and a promise of its contents.
    Object.defineProperty(input, 'files', {
      value: [{ name: 'copy.json', text: async () => '{"format":"x"}' }],
    });
    input.dispatchEvent(new Event('change'));

    await expect(pending).resolves.toEqual({ name: 'copy.json', text: '{"format":"x"}' });
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('resolves to nothing when the picker is cancelled', async () => {
    const pending = openBackupFile();
    document.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel'));

    await expect(pending).resolves.toBeNull();
  });

  it('treats a change with no file as a cancellation too', async () => {
    // Some browsers fire `change` with an empty list instead of `cancel`.
    const pending = openBackupFile();
    document.querySelector('input[type="file"]')!.dispatchEvent(new Event('change'));

    await expect(pending).resolves.toBeNull();
  });
});
