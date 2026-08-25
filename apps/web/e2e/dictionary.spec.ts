import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { openApp, waitForLaunch } from './helpers/launch';

/**
 * The dictionary half of search, in a real browser.
 *
 * ## What only a browser can answer here
 *
 * `data/dictionary.test.ts` proves the fetching and ranking against a stubbed
 * `fetch` — that two callers cause one download, that a chunk is not fetched to
 * answer a search, that a failure is not cached. All of that is true of the
 * module in isolation and none of it says the feature works.
 *
 * What it cannot say is whether the files are *there*. The dictionary is 4.5 MB
 * of JSON in `public/`, deliberately never imported, so no bundler resolves it,
 * no typechecker reads it and no unit test touches it. If the build stopped
 * copying `public/dictionary`, if a path lost its `BASE_URL` prefix, or if the
 * manifest named a chunk that had been cleaned away, every gate in the suite
 * would stay green and search would silently return only the 2,581 taught
 * words — which is exactly what search did before this feature existed, so
 * nobody would notice from the outside.
 *
 * So this asks a browser to type a word that is deliberately *not* taught, and
 * to find it anyway.
 */

/**
 * A headword the dictionary has and the syllabus does not — **chosen at run
 * time, not written down.**
 *
 * This constant has now broken twice for the same reason, and the second time
 * is what changed the approach. 나가다 was the first choice and turned out to
 * be *taught*, so the dedupe correctly hid it from the dictionary results and
 * the test failed for the one reason that meant the feature was working. 가지
 * replaced it, was untaught for three cycles, and then a vocabulary batch
 * taught it — so the click landed on the word card and the entry never opened.
 *
 * A word that is untaught today is a word somebody may teach tomorrow, and
 * there is no such thing as a safely untaught headword in a product whose whole
 * plan is to grow the syllabus toward ten thousand words. So the spec asks the
 * two files rather than remembering: it reads the shipped dictionary index and
 * the shipped corpus, and picks the most frequent Hangul headword that is in
 * the first and not in the second and has at least three senses — frequency so
 * the choice is a real word, three senses so the disclosure has something to
 * disclose.
 *
 * Deterministic, because the inputs are files rather than a random draw: the
 * same tree picks the same word every time, and a tree that teaches that word
 * picks the next one instead of failing.
 */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

interface DictionarySense {
  shortGloss: string;
}
interface DictionaryEntry {
  headword: string;
  senses: DictionarySense[];
}

function pickUntaughtHeadword(): { headword: string; senses: string[] } {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'dictionary/manifest.json'), 'utf8')) as {
    index: string;
  };
  const index = JSON.parse(readFileSync(join(PUBLIC, 'dictionary', manifest.index), 'utf8')) as {
    rows: [string, string, string, string, number | null][];
  };
  const corpus = JSON.parse(
    readFileSync(join(PUBLIC, '..', 'src/data/generated/vocabulary.json'), 'utf8'),
  ) as { words: { word: string }[] };
  const taught = new Set(corpus.words.map((word) => word.word));

  const chunkFiles = new Map<string, string>();
  for (const name of readdirSync(join(PUBLIC, 'dictionary/entries'))) {
    chunkFiles.set(name.slice(0, name.lastIndexOf('-')), name);
  }
  const loaded = new Map<string, Map<string, DictionaryEntry>>();
  const entriesIn = (chunk: string): Map<string, DictionaryEntry> => {
    const already = loaded.get(chunk);
    if (already) return already;
    const file = chunkFiles.get(chunk);
    const table = new Map<string, DictionaryEntry>();
    if (file) {
      const parsed = JSON.parse(
        readFileSync(join(PUBLIC, 'dictionary/entries', file), 'utf8'),
      ) as { entries: DictionaryEntry[] };
      for (const entry of parsed.entries) table.set(entry.headword, entry);
    }
    loaded.set(chunk, table);
    return table;
  };

  const candidates = index.rows
    .filter(
      ([headword, , , , frequency]) =>
        !taught.has(headword) &&
        headword.length >= 2 &&
        headword.length <= 3 &&
        [...headword].every((letter) => letter >= '가' && letter <= '힣') &&
        (frequency ?? 0) >= 300,
    )
    .sort((a, b) => (b[4] ?? 0) - (a[4] ?? 0));

  for (const [headword, , , chunk] of candidates) {
    const entry = entriesIn(chunk).get(headword);
    if (entry && entry.senses.length >= 3) {
      return { headword, senses: entry.senses.map((sense) => sense.shortGloss) };
    }
  }
  throw new Error('no untaught dictionary headword with three senses — has the dictionary shrunk?');
}

const { headword: LOOKUP, senses: LOOKUP_SENSES } = pickUntaughtHeadword();

test('finds a word the app does not teach, and says on the entry that it is not homework', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill(LOOKUP);

  /*
    One list, and the untaught word is simply in it.

    The results used to be split under a *Dictionary* heading carrying the line
    "reference only, not part of your daily practice". That sentence is true and
    it was on the wrong screen: somebody who has typed a word into a search box
    wants to know whether the word is there, not which of the app's two corpora
    answered. The distinction is made where a learner acts on it — on the entry
    they open — and this test now follows them there.
  */
  const results = page.getByRole('main');
  // Exact: the dictionary holds longer words containing this one, and a
  // substring match would find one of those and call it a pass for a search
  // that had failed.
  await expect(results.getByText(LOOKUP, { exact: true }).first()).toBeVisible();

  await results.getByText(LOOKUP, { exact: true }).first().click();
  await expect(page.getByText(/not part of your daily practice/i)).toBeVisible();
});

test('opens the entry, shows its senses, and credits the source', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill(LOOKUP);
  // One list since the search results were unified; the row is simply in it.
  await page.getByRole('main').getByText(LOOKUP, { exact: true }).first().click();

  await expect(page.getByTestId('dictionary-headword')).toHaveText(LOOKUP);

  /*
    The first sense is open; the rest are behind a disclosure that counts them.

    Which sense comes first is not asserted, and that is deliberate. This used
    to require "twig or branch" to be the visible one, and it broke the day the
    ingestion started reading definitions written as templates: 가지 went from
    two senses to four, "kind, sort; variety" sorted ahead of it, and a passing
    test turned into a failing one on a change that made the dictionary better.
    A gloss written by an upstream editor is not this app's fact to pin.

    What *is* this app's promise: one sense is shown, the others are counted and
    reachable, and the licence is credited on the same screen.
  */
  const senses = page.getByRole('group');
  await expect(senses).toContainText(/other meaning/i);
  // A `<details>`/`<summary>`, not a button — the disclosure is native, so
  // `getByRole('button')` finds nothing inside it and waits until the test
  // times out. The summary is what opens it.
  await senses.locator('summary').click();
  /*
    The *last* sense, read from the shipped entry rather than named here.

    Which gloss that is depends on which headword the picker chose, and pinning
    a string is what put 가지's "twig or branch" in this file in the first
    place. The last sense is the one that cannot be the one already visible, so
    seeing it is proof the disclosure opened.
  */
  const hidden = LOOKUP_SENSES[LOOKUP_SENSES.length - 1]!;
  await expect(page.getByText(hidden, { exact: false }).first()).toBeVisible();

  /*
    CC BY-SA 4.0 asks for attribution where the material is used, and this is
    where it is used. Asserted rather than trusted, because the line is easy to
    lose in a refactor and its absence is a licence problem rather than a
    cosmetic one.
  */
  await expect(page.getByText(/CC BY-SA 4\.0/)).toBeVisible();
});

test('a taught word is never offered twice', async ({ page }) => {
  await openApp(page, '/words');
  await waitForLaunch(page);

  // 차 is on the syllabus and also in the dictionary. The card wins; the
  // dictionary's other senses of it live on that card, under Other meanings.
  await page.getByRole('searchbox').fill('차');

  // One row, in one list. Two would be a choice the learner should not have to
  // make — one leading to a hand-written card with a recording, the other to a
  // bare gloss of the same spelling.
  await expect(page.getByRole('main').getByText('차', { exact: true })).toHaveCount(1);
});

test('a taught word gains dictionary examples of the sense it teaches', async ({ page }) => {
  /*
    §8–§15 removed the *More from the dictionary* disclosure and everything under
    it. The screenshot that prompted it showed 발 offering the learner "leg",
    "counter for steps", "a blind screen", "strands of noodles" and "rounds of
    gunfire" on a card that teaches one sense of one word.

    What replaced it is narrower on purpose: sentences from the dictionary that
    demonstrate *the taught sense*, filtered by `data/exampleQuality.ts`, at most
    two, with no disclosure to open. 195 of 2,578 cards gain one — see
    `worddetail:qa` — and 방 is one of them.
  */
  await openApp(page, '/words');
  await waitForLaunch(page);

  await page.getByRole('searchbox').fill('방');
  await page.getByRole('link', { name: /방/ }).first().click();
  await expect(page.getByTestId('detail-headword')).toHaveText('방');

  const more = page.getByRole('region', { name: /more examples/i });
  await expect(more).toBeVisible();
  // Its own example is on the card already; this section must not repeat it.
  await expect(more.getByText('방이 깨끗해요.')).toHaveCount(0);
  await expect(more.locator('li')).not.toHaveCount(0);
  expect(await more.locator('li').count()).toBeLessThanOrEqual(2);

  // And nothing offering the senses the card does not teach.
  await expect(page.getByText(/more from the dictionary/i)).toHaveCount(0);
});
