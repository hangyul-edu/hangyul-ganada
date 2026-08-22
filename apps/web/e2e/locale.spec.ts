import { expect, test, type Page } from '@playwright/test';

/**
 * Localization, in the real browser.
 *
 * The unit tests cover resolution and fallback; these cover the things only a
 * running page can show — that the document attributes actually change and that
 * a choice survives a reload.
 *
 * **Right-to-left is covered.** This note used to say Arabic had been withdrawn
 * and that no RTL interface was reachable; that was wrong, and it had been wrong
 * long enough for the suite to have no RTL layout coverage at all while shipping
 * an RTL language. `ar` is in `AVAILABLE_LOCALES`, `describeLocale('ar')` reports
 * `direction: 'rtl'`, and it is offered in the picker. The layout assertions live
 * in `review-hub.spec.ts` alongside the other viewport work; the direction
 * *resolution* is unit-tested in `src/i18n/LocaleProvider.test.tsx`, including
 * against a language with no bundle, which is the state a future Hebrew or
 * Persian translation would start from.
 */

const openLanguagePicker = async (page: Page) => {
  await page.goto('/me');
  await page.getByTestId('settings-language').click();
  await expect(page.getByRole('heading', { name: 'Choose a language' })).toBeVisible();
};

test('a fresh learner gets the language their device is in', async ({ browser }) => {
  /*
   * §55, and the exact reversal of what this test used to assert.
   *
   * It used to require English *whatever the browser asked for*, on the argument
   * that a default which changes with where you are standing is one nobody can
   * reason about. That was answering the wrong question. The person this rule
   * decides for has just installed a Korean *beginner's* app and may read
   * neither Korean nor English; under the old rule their first screen was in
   * English and the way out was a settings screen labelled, in English,
   * "Language".
   */
  const korean = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const koreanPage = await korean.newPage();
  await koreanPage.goto('/');
  await expect(koreanPage.locator('html')).toHaveAttribute('lang', 'ko');
  await korean.close();

  const japanese = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const japanesePage = await japanese.newPage();
  await japanesePage.goto('/');
  await expect(japanesePage.locator('html')).toHaveAttribute('lang', 'ja');
  await japanese.close();
});

test('a device language we do not ship falls back to English', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'is-IS', timezoneId: 'Atlantic/Reykjavik' });
  const page = await context.newPage();
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Start now' })).toBeVisible();
  await context.close();
});

test('the picker lists languages by their own names and is searchable', async ({ page }) => {
  await openLanguagePicker(page);

  await expect(page.getByRole('button', { name: /한국어/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /日本語/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Deutsch/ })).toBeVisible();

  // Arabic ships, and is offered by its own name and by an English search for
  // it. It used to be the example of a language the picker must *not* list; it
  // is now the example of the one whose row has to survive a right-to-left
  // layout inside a left-to-right list.
  await expect(page.getByRole('button', { name: /العربية/ })).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search languages' }).fill('arabic');
  await expect(page.getByRole('button', { name: /العربية/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /한국어/ })).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search languages' }).fill('');

  // A language the product does not ship, by name and by code, is still absent.
  await expect(page.getByRole('button', { name: /Dansk/ })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search languages' }).fill('danish');
  await expect(page.getByText(/No language matches/)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search languages' }).fill('');

  await page.getByRole('searchbox', { name: 'Search languages' }).fill('port');
  await expect(page.getByRole('button', { name: /Português/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /한국어/ })).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search languages' }).fill('zzzz');
  await expect(page.getByText(/No language matches/)).toBeVisible();
});

test('switching to Korean updates the interface without a reload', async ({ page }) => {
  await openLanguagePicker(page);
  await page.getByRole('button', { name: /한국어/ }).click();

  // The picker itself re-renders in the new language — no navigation involved.
  await expect(page.getByRole('heading', { name: '언어 선택' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');

  await page.goto('/');
  await expect(page.getByRole('button', { name: '바로 시작하기' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
});

test('the chosen language survives a reload', async ({ page }) => {
  await openLanguagePicker(page);
  await page.getByRole('button', { name: /한국어/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await page.goto('/letters');
  await expect(page.getByRole('heading', { name: '글자 배우기' })).toBeVisible();
});

test('a long-text European language does not break the layout', async ({ page }) => {
  await openLanguagePicker(page);
  await page.getByRole('button', { name: /Deutsch/ }).click();

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Jetzt starten' })).toBeVisible();

  // German tab labels are the longest in the app; the bar must not scroll.
  const nav = page.getByRole('navigation', { name: 'Hauptmenü' });
  await expect(nav).toBeVisible();
  const overflows = await nav.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflows, 'bottom navigation overflows in German').toBe(false);

  // Nothing anywhere pushes the page sideways.
  const bodyOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(bodyOverflows, 'page scrolls horizontally in German').toBe(false);
});

test('Korean learning content is never translated', async ({ page }) => {
  // Which word opens the lesson is a curation decision, so the test reads it
  // off the page rather than naming it. What is being asserted is a property,
  // not a word: the Korean stays Korean when the interface language changes,
  // and the meaning beside it does not.
  // Today's sitting, which is where a word is met now. There is no lesson id:
  // vocabulary is not browsed as numbered sets any more.
  await page.goto('/words/today');
  await page.evaluate(() => document.fonts.ready);
  const koreanWord = page.getByTestId('word-headword');
  await expect(koreanWord).toBeVisible();
  const korean = (await koreanWord.innerText()).trim();
  expect(korean, 'the word on the card is written in Hangul').toMatch(/^[가-힣]+$/);
  const englishMeaning = (await page.getByTestId('word-meaning').innerText()).trim();
  expect(englishMeaning).not.toBe('');

  // Switch to Korean: the meaning changes, the word does not.
  await openLanguagePicker(page);
  await page.getByRole('button', { name: /한국어/ }).click();
  await page.goto('/words/today');
  await page.evaluate(() => document.fonts.ready);

  await expect(page.getByTestId('word-headword')).toHaveText(korean);
  await expect(page.getByTestId('word-meaning')).not.toHaveText(englishMeaning);
});

/**
 * A raw key on screen is the single most visible localization failure, so it is
 * checked in every shipped language rather than sampled.
 *
 * One test per locale: 24 page loads in a single test is a slow test that fails
 * as one opaque timeout, and the picker cannot be reached by its English label
 * once the interface has already switched.
 */
for (const locale of ['ko', 'de', 'ja', 'zh-CN', 'es', 'fr', 'pt-BR']) {
  test(`no screen renders a raw translation key in ${locale}`, async ({ page }) => {
    // A dotted lowercase path with no spaces is what an unresolved key looks
    // like. Anchored to a whole line so ordinary prose cannot trip it.
    const KEY_SHAPE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){2,}$/;

    await page.addInitScript(
      (code) => window.localStorage.setItem('hangyul_ganada:locale', code),
      locale,
    );

    for (const path of [
      '/',
      '/letters',
      '/words',
      '/review',
      '/me',
      '/me/language',
      '/letters/lesson-vowels-1',
      '/words/today',
      '/words/category/food',
    ]) {
      await page.goto(path);
      await expect(page.locator('#main')).toBeVisible();
      const text = await page.locator('body').innerText();
      const offenders = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => KEY_SHAPE.test(line));
      expect(offenders, `${locale} ${path}`).toEqual([]);
    }
  });
}
