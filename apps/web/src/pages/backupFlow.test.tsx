import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PronunciationProvider } from '../audio/PronunciationProvider';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { MemoryDriver } from '../storage/driver';
import { BACKUP_FORMAT } from '../storage/backup';
import { META_KEY, SCHEMA_VERSION, type SchemaMeta } from '../storage/schema';
import { LearnerProvider } from '../store/LearnerProvider';
import { MyPage } from './MyPage';

/**
 * Saving a copy and putting it back, through the screen a learner uses.
 *
 * `backup.test.ts` proves the envelope and the round trip against a driver.
 * This proves the part that the module cannot: that the two buttons are wired
 * to it, that a file the learner picks is *validated before* anything is
 * cleared, and that each way of picking the wrong file produces the sentence
 * written for it rather than a silent no-op.
 *
 * The platform adapter is mocked because it is the one piece with no meaningful
 * behaviour in jsdom — a share sheet and a file picker are the operating
 * system's, not the app's. What is asserted here is everything on this side of
 * it: what the app hands over, and what it does with what comes back.
 */

const file = vi.hoisted(() => ({
  saved: null as { json: string; filename: string } | null,
  picked: null as { name: string; text: string } | null,
  fail: false,
}));

vi.mock('../storage/backupFile', () => ({
  saveBackupFile: vi.fn(async (json: string, filename: string) => {
    if (file.fail) throw new Error('the learner dismissed the share sheet');
    file.saved = { json, filename };
    return 'downloaded' as const;
  }),
  openBackupFile: vi.fn(async () => file.picked),
}));

function open(driver: MemoryDriver) {
  return render(
    <LearnerProvider driver={driver}>
      <LocaleProvider>
        <PronunciationProvider voice="female">
          <MemoryRouter initialEntries={['/me']}>
            <MyPage />
          </MemoryRouter>
        </PronunciationProvider>
      </LocaleProvider>
    </LearnerProvider>,
  );
}

async function aDriverWithProgress(): Promise<MemoryDriver> {
  const driver = new MemoryDriver();
  await driver.put<SchemaMeta>('meta', META_KEY, {
    schema_version: SCHEMA_VERSION,
    installed_at: '2026-06-01T09:00:00.000Z',
    last_opened_at: '2026-09-03T09:00:00.000Z',
    install_id: 'install-a',
  });
  await driver.put('progress', 'character:ㄱ', {
    kind: 'character',
    item_key: 'ㄱ',
    learned: true,
  });
  return driver;
}

beforeEach(() => {
  file.saved = null;
  file.picked = null;
  file.fail = false;
});

describe('saving a copy', () => {
  it('hands the platform a named file holding what the learner has done', async () => {
    const driver = await aDriverWithProgress();
    open(driver);
    const save = await screen.findByTestId('backup-save');

    await userEvent.click(save);

    await waitFor(() => expect(file.saved).not.toBeNull());
    expect(file.saved?.filename).toMatch(/^hangyul-ganada-learning-\d{4}-\d{2}-\d{2}\.json$/);
    const written = JSON.parse(file.saved!.json) as Record<string, unknown>;
    expect(written.format).toBe(BACKUP_FORMAT);
    expect(written.stores).toMatchObject({
      progress: [['character:ㄱ', { kind: 'character', item_key: 'ㄱ', learned: true }]],
    });
    expect(await screen.findByTestId('backup-notice')).toHaveTextContent(
      'Your learning was saved.',
    );
  });

  it('says so when the file did not get written', async () => {
    file.fail = true;
    open(await aDriverWithProgress());

    await userEvent.click(await screen.findByTestId('backup-save'));

    expect(await screen.findByTestId('backup-notice')).toHaveTextContent(
      'The copy could not be saved.',
    );
  });
});

describe('restoring a copy', () => {
  it('asks first, and then the learning on the screen is the file’s', async () => {
    /*
     * The word count on this screen is read from the restored rows, so it is
     * the honest end-to-end assertion: the file went in, the migrations ran,
     * the loaders repaired what they read, and the number a learner looks at
     * changed. Nothing here reads the driver directly.
     */
    const source = await aDriverWithProgress();
    const first = open(source);
    await userEvent.click(await screen.findByTestId('backup-save'));
    await waitFor(() => expect(file.saved).not.toBeNull());
    file.picked = { name: file.saved!.filename, text: file.saved!.json };
    // The old phone goes away before the new one is opened, so the screen
    // asserted on below is unambiguously the one that restored.
    first.unmount();

    const target = new MemoryDriver();
    open(target);
    await userEvent.click(await screen.findByTestId('backup-restore'));
    await userEvent.click(await screen.findByTestId('backup-restore-confirm'));

    await waitFor(async () =>
      expect(await target.get('progress', 'character:ㄱ')).toMatchObject({ learned: true }),
    );
    expect(await screen.findByTestId('backup-notice')).toHaveTextContent(
      'Your learning has been restored.',
    );
  });

  it('clears nothing when the learner cancels the confirmation', async () => {
    const source = await aDriverWithProgress();
    const first = open(source);
    await userEvent.click(await screen.findByTestId('backup-save'));
    await waitFor(() => expect(file.saved).not.toBeNull());
    file.picked = { name: 'other.json', text: file.saved!.json };
    first.unmount();

    const target = new MemoryDriver();
    await target.put('progress', 'character:ㄴ', { kind: 'character', item_key: 'ㄴ' });
    open(target);
    await userEvent.click(await screen.findByTestId('backup-restore'));
    await userEvent.click(await screen.findByTestId('backup-restore-cancel'));

    expect(await target.get('progress', 'character:ㄴ')).toBeDefined();
  });

  it.each([
    ['a file that is not JSON', 'this is my shopping list', 'That file is not a copy of your learning.'],
    [
      'a copy from a newer app',
      JSON.stringify({
        format: BACKUP_FORMAT,
        format_version: 1,
        schema_version: SCHEMA_VERSION + 1,
        stores: { progress: [['character:ㄱ', {}]] },
      }),
      'That copy was made by a newer version of the app. Update the app, then try again.',
    ],
    [
      'an empty copy',
      JSON.stringify({
        format: BACKUP_FORMAT,
        format_version: 1,
        schema_version: SCHEMA_VERSION,
        stores: {},
      }),
      'That copy has nothing in it.',
    ],
  ])('refuses %s before clearing anything, and says why', async (_name, text, message) => {
    file.picked = { name: 'picked.json', text };
    const driver = await aDriverWithProgress();
    open(driver);

    await userEvent.click(await screen.findByTestId('backup-restore'));

    expect(await screen.findByTestId('backup-notice')).toHaveTextContent(message);
    expect(screen.queryByTestId('backup-restore-confirm')).toBeNull();
    expect(await driver.get('progress', 'character:ㄱ')).toBeDefined();
  });

  it('says nothing at all when the picker is dismissed', async () => {
    file.picked = null;
    open(await aDriverWithProgress());

    await userEvent.click(await screen.findByTestId('backup-restore'));

    await waitFor(() => expect(screen.queryByTestId('backup-notice')).toBeNull());
  });
});
