/**
 * Mobile visual QA for the app shell.
 *
 * Captures the screens that changed in this pass at the three phone widths the
 * design is drawn for, and — more usefully than a screenshot — *measures* the
 * two things the eye is bad at judging from one:
 *
 *   • the gap between the last piece of content and the bottom navigation
 *   • whether any scroll container is showing a scrollbar
 *
 * A gap is only a defect when the page does not scroll: on a page taller than
 * the viewport the bottom of the content is simply off-screen, and the figure
 * to look at is the padding under the final card instead. Both are reported.
 *
 *   node scripts/screenshot-home.mjs [outDir] [baseUrl]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const outDir = process.argv[2] ?? '../../.visual-qa/home';
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4173';

const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

const SCREENS = [
  { name: 'home', path: '/' },
  { name: 'words', path: '/words' },
  { name: 'letters', path: '/letters' },
  { name: 'review', path: '/review' },
  { name: 'activity', path: '/me/activity' },
  { name: 'settings', path: '/me' },
];

/**
 * A learner a few days in.
 *
 * Seeded straight into IndexedDB rather than driven through the UI: the point
 * is to photograph a populated screen, and forty sessions of mouse-drawing to
 * get there would be forty chances for the fixture to differ between runs.
 */
const SEED_LETTERS = ['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'];

async function seed(page) {
  await page.evaluate(async (letters) => {
    const now = new Date().toISOString();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('hangyul-ganada');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const row = (kind, key) => ({
      item_key: key,
      kind,
      stage: 'learned',
      attempts: 3,
      passes: 3,
      fails: 0,
      trace_passes: 1,
      write_passes: 1,
      recognition_passes: 1,
      heard: true,
      learned: true,
      needs_review: false,
      last_score: 0.94,
      first_seen_at: now,
      last_attempted_at: now,
      learned_at: now,
      review_due_at: null,
    });

    const today = new Date();
    const days = [0, 1, 2, 3].map((n) => {
      const d = new Date(today.getTime() - n * 86_400_000);
      return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    });

    const tx = db.transaction(['progress', 'settings', 'activity'], 'readwrite');
    const progress = tx.objectStore('progress');
    for (const letter of letters) progress.put(row('character', letter), `character:${letter}`);

    // A month of practice, so the Activity screen photographs as a learner
    // would actually see it rather than in its first-run state.
    const activity = tx.objectStore('activity');
    for (let back = 34; back >= 0; back -= 1) {
      const when = new Date(today.getTime() - back * 86_400_000);
      if (back % 8 === 3) continue;
      const date = `${when.getFullYear()}-${`${when.getMonth() + 1}`.padStart(2, '0')}-${`${when.getDate()}`.padStart(2, '0')}`;
      activity.put(
        {
          date,
          first_at: when.toISOString(),
          last_at: when.toISOString(),
          active_ms: (5 + (back % 14)) * 60_000,
          attempts: 3 + ((back * 5) % 24),
          passes: 2 + ((back * 4) % 18),
          characters_learned: back % 4 === 0 ? 1 : 0,
          words_learned: back % 7 === 0 ? 2 : 0,
          reviews: back % 6 === 0 ? 3 : 0,
          items: { 'character:ㅏ': 6, 'character:ㄱ': 4, 'character:ㅓ': 9 },
        },
        date,
      );
    }
    const settings = tx.objectStore('settings');
    const existing = await new Promise((resolve) => {
      const r = settings.get('preferences');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    });
    settings.put({ ...(existing ?? {}), active_days: days }, 'preferences');
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  }, SEED_LETTERS);
}

/** Everything on the page that scrolls, and whether it is showing a scrollbar. */
async function scrollAudit(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      const scrollsY = el.scrollHeight > el.clientHeight + 1;
      const scrollsX = el.scrollWidth > el.clientWidth + 1;
      const canScroll = /auto|scroll/.test(style.overflowY + style.overflowX);
      if (!canScroll || (!scrollsY && !scrollsX)) continue;
      out.push({
        selector: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : ''),
        // The gutter a visible scrollbar occupies. Zero means none is drawn.
        scrollbarX: el.offsetHeight - el.clientHeight,
        scrollbarY: el.offsetWidth - el.clientWidth,
        scrollsY,
        scrollsX,
      });
    }
    return out;
  });
}

/** How much empty space sits under the last visible content. */
async function bottomGap(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('#main');
    if (!scroller) return null;
    const page = scroller.firstElementChild;
    if (!page) return null;

    // The deepest element that actually paints something, so a wrapper with
    // trailing padding is not mistaken for content.
    let lowest = 0;
    for (const el of page.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) continue;
      lowest = Math.max(lowest, rect.bottom);
    }

    const nav = document.querySelector('nav');
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const scrollable = scroller.scrollHeight > scroller.clientHeight + 1;

    return {
      scrollable,
      // Only meaningful on a page that fits: on a scrolling page the content
      // continues below the fold and this measures nothing.
      gapToNav: Math.round(navTop - lowest),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      // Padding under the final card, which is the figure that matters on a
      // page that scrolls: scroll to the end and measure again.
      paddingAtEnd: null,
    };
  });
}

async function paddingAtEnd(page) {
  return page.evaluate(async () => {
    const scroller = document.querySelector('#main');
    if (!scroller) return null;
    scroller.scrollTop = scroller.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let lowest = 0;
    for (const el of scroller.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) continue;
      lowest = Math.max(lowest, rect.bottom);
    }
    const nav = document.querySelector('nav');
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    scroller.scrollTop = 0;
    return Math.round(navTop - lowest);
  });
}

const browser = await chromium.launch();
const report = [];
await mkdir(outDir, { recursive: true });

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await seed(page);

  for (const screen of SCREENS) {
    await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);

    const file = `${outDir}/${screen.name}-${viewport.name}.png`;
    await page.screenshot({ path: file });

    const gap = await bottomGap(page);
    if (gap) gap.paddingAtEnd = await paddingAtEnd(page);
    report.push({
      screen: screen.name,
      viewport: viewport.name,
      gap,
      scrollers: await scrollAudit(page),
      horizontalPageOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
    });
  }

  await context.close();
}

await browser.close();
await writeFile(`${outDir}/report.json`, `${JSON.stringify(report, null, 1)}\n`, 'utf8');

for (const row of report) {
  const g = row.gap;
  const bars = row.scrollers.filter((s) => s.scrollbarX > 0 || s.scrollbarY > 0);
  console.log(
    `${row.screen.padEnd(9)} ${row.viewport.padEnd(8)} ` +
      `${g?.scrollable ? 'scrolls' : 'fits   '} ` +
      `gapToNav=${String(g?.gapToNav).padStart(4)} endPadding=${String(g?.paddingAtEnd).padStart(4)} ` +
      `scrollbars=${bars.length} ${row.horizontalPageOverflow ? 'H-OVERFLOW' : ''}`,
  );
}
