/**
 * Localization visual QA.
 *
 * Captures every screen in several languages at the phone widths the design is
 * drawn for, and reports layout failures the eye would otherwise have to hunt
 * for: horizontal page overflow, clipped text, and elements pushed outside the
 * app shell.
 *
 *   node scripts/screenshot-locales.mjs [outDir] [baseUrl]
 *
 * The language set is deliberate rather than exhaustive: English as the source,
 * Korean as the other complete translation, German for the longest strings in
 * the app, and Japanese for a CJK script with no spaces to wrap at. No
 * right-to-left language ships since Arabic was withdrawn.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const outDir = process.argv[2] ?? '../../.visual-qa/i18n';
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4173';

const LOCALES = ['en', 'ko', 'de', 'ja'];
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];
const SCREENS = [
  ['home', '/'],
  ['letters', '/letters'],
  ['words', '/words'],
  ['review', '/review'],
  ['me', '/me'],
  ['language', '/me/language'],
  /*
   * The two session screens, by their real ids.
   *
   * Both entries here were stale — `lesson-vowels-1` and `vocab-lesson-2-2` do
   * not exist — so this QA had been photographing the Not Found screen in four
   * languages at three widths and reporting no layout problems, which was true
   * and useless. A screen that cannot be reached is a layout that cannot be
   * checked, so the run now fails if either route renders the empty state.
   */
  ['letter-session', '/letters/lesson-vowels-core'],
  ['word-session', '/words/vocab-essentials-1'],
];

/** Text that means the route did not resolve, in the languages this captures. */
const NOT_FOUND = [/couldn't find/i, /찾을 수 없/, /nicht finden/i, /見つかりません/];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const findings = [];

for (const locale of LOCALES) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    // Seed the stored preference rather than clicking through the picker, so a
    // failure in one screen cannot cascade into every later shot.
    await context.addInitScript(
      (code) => window.localStorage.setItem('hangyul_ganada:locale', code),
      locale,
    );
    const page = await context.newPage();

    for (const [name, path] of SCREENS) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);

      const problems = await page.evaluate(() => {
        const out = [];
        const doc = document.documentElement;
        if (doc.scrollWidth > window.innerWidth + 1) {
          out.push(`page scrolls horizontally (${doc.scrollWidth} > ${window.innerWidth})`);
        }

        /** True when some ancestor is a deliberate horizontal scroll region. */
        const inScroller = (el) => {
          for (let node = el.parentElement; node; node = node.parentElement) {
            const overflow = getComputedStyle(node).overflowX;
            if (overflow === 'auto' || overflow === 'scroll') return true;
          }
          return false;
        };

        for (const el of document.querySelectorAll('body *')) {
          // Visually-hidden text is clipped to 1px on purpose; it is read, not
          // seen, and reporting it would bury the findings that matter.
          if (el.classList.contains('hg-sr-only')) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const text = el.textContent?.trim() ?? '';
          if (!text || el.children.length > 0) continue;

          // Clipped: content wider or taller than its own box, with no scroll
          // and no visible overflow to escape into.
          const clippedX =
            el.scrollWidth > el.clientWidth + 1 &&
            style.overflowX !== 'auto' &&
            style.overflowX !== 'scroll' &&
            style.overflowX !== 'visible';
          const clippedY =
            el.scrollHeight > el.clientHeight + 1 &&
            style.overflowY !== 'auto' &&
            style.overflowY !== 'scroll' &&
            style.overflowY !== 'visible';
          if (clippedX || clippedY) {
            out.push(
              `clipped <${el.tagName.toLowerCase()} class="${el.className}">: ${text.slice(0, 40)}`,
            );
          }

          const rect = el.getBoundingClientRect();
          if (
            rect.width > 0 &&
            (rect.right < -1 || rect.left > window.innerWidth + 1) &&
            // A chip row that scrolls sideways is supposed to hold content
            // beyond the fold; only content stranded outside a *fixed* layout
            // is a defect.
            !inScroller(el)
          ) {
            out.push(`off-screen: ${text.slice(0, 40)}`);
          }
        }
        return [...new Set(out)];
      });

      const body = await page.evaluate(() => document.body.innerText);
      if (NOT_FOUND.some((pattern) => pattern.test(body))) {
        problems.push('rendered the Not Found screen — this route does not exist');
      }
      if (problems.length) findings.push({ locale, viewport: vp.name, screen: name, problems });
      await page.screenshot({ path: `${outDir}/${locale}-${vp.name}-${name}.png` });
    }

    await context.close();
    console.log(`  ${locale} @ ${vp.name}`);
  }
}

await browser.close();
await writeFile(`${outDir}/findings.json`, `${JSON.stringify(findings, null, 2)}\n`);

if (findings.length === 0) {
  console.log('\nNo layout problems found.');
} else {
  console.log(`\n${findings.length} screen(s) with layout problems:`);
  for (const f of findings) {
    console.log(`  [${f.locale} ${f.viewport} ${f.screen}]`);
    for (const p of f.problems) console.log(`    ${p}`);
  }
  // A visual QA that always exits 0 is a visual QA nobody notices failing.
  process.exitCode = 1;
}
console.log(`\nwrote to ${outDir}`);
