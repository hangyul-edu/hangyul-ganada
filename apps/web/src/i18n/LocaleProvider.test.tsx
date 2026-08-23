import { memo } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from './LocaleProvider';
import { useLocale } from './LocaleContext';
import { LOCALE_STORAGE_KEY } from './preference';
import { RESOURCES } from './resources';

/**
 * A probe standing in for any screen in the app.
 *
 * It touches exactly what a real component touches — `useTranslation` for copy,
 * `useLocale` for the language — so a change that would break every screen
 * breaks this test.
 */
function Probe() {
  const { t } = useTranslation(['navigation', 'learning']);
  const { locale, direction, setLocale, source } = useLocale();
  return (
    <div>
      <p data-testid="letters">{t('navigation:tabs.letters')}</p>
      <p data-testid="prompt">{t('learning:session.prompt.write')}</p>
      <p data-testid="locale">{locale}</p>
      <p data-testid="direction">{direction}</p>
      <p data-testid="source">{source}</p>
      {/* The character being learned, rendered by the app the way a session
          screen renders it: straight through, never through `t`. */}
      <p data-testid="glyph">가</p>
      <p data-testid="word">사과</p>
      <p data-testid="script">한글</p>
      <button type="button" onClick={() => void setLocale('ko')}>
        korean
      </button>
      {/* Hebrew ships no bundle, and that is deliberate: right-to-left
          handling has to keep working for a language the app has not been
          translated into yet. Arabic — which does ship — is covered separately;
          this is the untranslated-RTL case. */}
      <button type="button" onClick={() => void setLocale('he')}>
        hebrew
      </button>
      <button type="button" onClick={() => void setLocale('de')}>
        german
      </button>
    </div>
  );
}

/**
 * Chrome: a component that re-renders for no reason of its own.
 *
 * `Probe` above reads `useLocale()`, so a language change re-renders it whether
 * or not i18next says anything. The bottom navigation does not — it is memoised
 * chrome whose props never change — and that is how it came to read
 * "Home / Letters / Words" under a fully Arabic home screen: the strings for a
 * stored language arrive *after* the first paint, and if nothing tells
 * `useTranslation` about it, nothing that only listens to i18next updates.
 */
const Chrome = memo(function Chrome() {
  const { t } = useTranslation(['navigation']);
  return <p data-testid="chrome">{t('navigation:tabs.letters')}</p>;
});

const renderApp = (props: Parameters<typeof LocaleProvider>[0] extends never ? never : object = {}) =>
  render(
    <LocaleProvider {...props}>
      <Probe />
    </LocaleProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
});

describe('LocaleProvider', () => {
  it('starts a fresh learner in English', () => {
    renderApp();
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    // `device`, not `default`: jsdom reports an English navigator and English
    // is a language we ship, so the device rule matches rather than falling
    // through. The *locale* is the point of this test; the source records
    // honestly which rule produced it. See `resolveLocale`.
    expect(screen.getByTestId('source')).toHaveTextContent('device');
    expect(screen.getByTestId('letters')).toHaveTextContent('Letters');
  });

  it('sets the document language and direction', () => {
    renderApp();
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('switches language at runtime with no reload and no remount', async () => {
    const user = userEvent.setup();
    renderApp();

    const glyphNode = screen.getByTestId('glyph');
    await user.click(screen.getByRole('button', { name: 'korean' }));

    await waitFor(() => expect(screen.getByTestId('letters')).toHaveTextContent('낱자'));
    expect(screen.getByTestId('prompt')).toHaveTextContent('안내선을 따라 손가락으로 써 보세요');
    expect(document.documentElement.getAttribute('lang')).toBe('ko');
    // The same DOM node: nothing was torn down, so a half-drawn character
    // would have survived the switch.
    expect(screen.getByTestId('glyph')).toBe(glyphNode);
  });

  it('persists the choice immediately', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'korean' }));
    await waitFor(() => expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ko'));
  });

  it('restores the persisted choice on the next visit', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    renderApp();
    expect(screen.getByTestId('locale')).toHaveTextContent('ko');
    expect(screen.getByTestId('source')).toHaveTextContent('stored');
    expect(screen.getByTestId('letters')).toHaveTextContent('낱자');
  });

  it('translates chrome that never re-renders on its own', async () => {
    /*
     * The regression, reproduced: a stored language whose strings are *not* in
     * the instance when it is created and arrive a tick later, rendered by a
     * component with no state, no context and no changing props.
     *
     * The suite preloads every bundle (see `test/setup.ts`), which is the one
     * thing that hides this bug — i18next is handed Korean at construction and
     * the first render is already right. So Korean is taken back out of
     * `RESOURCES` for the length of this test, which is what a browser sees:
     * English bundled, everything else fetched.
     */
    const korean = RESOURCES.ko!;
    delete RESOURCES.ko;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
      render(
        <LocaleProvider>
          <Chrome />
        </LocaleProvider>,
      );
      expect(screen.getByTestId('chrome')).toHaveTextContent('Letters');
      await waitFor(() => expect(screen.getByTestId('chrome')).toHaveTextContent('낱자'));
    } finally {
      RESOURCES.ko = korean;
    }
  });

  it('lets an account preference win over the device one', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    render(
      <LocaleProvider profileLocale="ja">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('ja');
    expect(screen.getByTestId('source')).toHaveTextContent('account');
  });

  it('reports a language change so localized server data can be refetched', async () => {
    const user = userEvent.setup();
    const onLocaleChange = vi.fn();
    const onLocaleApplied = vi.fn();
    render(
      <LocaleProvider onLocaleChange={onLocaleChange} onLocaleApplied={onLocaleApplied}>
        <Probe />
      </LocaleProvider>,
    );
    onLocaleApplied.mockClear();

    await user.click(screen.getByRole('button', { name: 'german' }));
    await waitFor(() => expect(onLocaleChange).toHaveBeenCalledWith('de'));
    expect(onLocaleApplied).toHaveBeenCalledWith('de');
  });

  it('falls back to English for a missing translation without showing a key', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'german' }));
    await waitFor(() => expect(screen.getByTestId('letters')).toHaveTextContent('Buchstaben'));
    // Every rendered string is prose, never a dotted path.
    for (const id of ['letters', 'prompt']) {
      expect(screen.getByTestId(id).textContent).not.toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
    }
  });
});

describe('right-to-left locales', () => {
  it('flips the document direction', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'hebrew' }));

    await waitFor(() => expect(document.documentElement.getAttribute('dir')).toBe('rtl'));
    expect(document.documentElement.getAttribute('lang')).toBe('he');
    expect(screen.getByTestId('direction')).toHaveTextContent('rtl');
  });

  it('flips back when a left-to-right language is chosen', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'hebrew' }));
    await waitFor(() => expect(document.documentElement.getAttribute('dir')).toBe('rtl'));

    await user.click(screen.getByRole('button', { name: 'korean' }));
    await waitFor(() => expect(document.documentElement.getAttribute('dir')).toBe('ltr'));
  });

  it('does not touch the Korean being learned', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'hebrew' }));
    await waitFor(() => expect(document.documentElement.getAttribute('dir')).toBe('rtl'));

    // The characters themselves are unchanged, un-reordered and un-translated.
    expect(screen.getByTestId('glyph')).toHaveTextContent('가');
    expect(screen.getByTestId('word')).toHaveTextContent('사과');
    expect(screen.getByTestId('script')).toHaveTextContent('한글');
  });
});
