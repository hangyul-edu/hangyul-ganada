import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AVAILABLE_LOCALES } from '../i18n/resources';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { LearnerProvider } from '../store/LearnerProvider';
import { AppShell } from '../ui/AppShell';
import { BottomNavigation } from '../ui/BottomNavigation';
import { LegalPage } from './LegalPage';
import { PrivacyPage } from './PrivacyPage';

/**
 * The legal and informational screens show their own content and nothing else.
 *
 * ## The reported defect
 *
 * A screenshot of the Privacy screen with the **Pronunciation voice** setting
 * printed underneath it — the female/male picker, the sample clip, the provider
 * line — below a page that had already finished saying what it had to say about
 * privacy. Whatever produced it, the property it violated is simple enough to
 * assert directly, and asserting it is worth more than knowing which of route
 * nesting, a shared layout, a portal or a scroll container did it: those are
 * four ways to reintroduce the same defect, and this fails for all of them.
 *
 * ## What is asserted, and why it is two things
 *
 * **No settings group, by marker.** `MyPage` tags every group it draws with
 * `data-settings-group`. None may appear here. This is the structural half: it
 * catches a layout or a portal that renders My Learning's body under a legal
 * route, whatever language the app is in.
 *
 * **No voice copy, by text, in all thirty-two languages.** The heading of the
 * voice setting is read out of each locale's own `settings.json` and must not
 * be on the page. This is the half that survives a refactor: a future
 * implementation that renders the voice picker without the group wrapper — a
 * card, a sheet, a bare fragment — has no marker to find and still says
 * *발음 목소리*.
 *
 * Both directions matter. The first cannot see copy that arrives without its
 * container; the second cannot see a container that arrives without its copy.
 */

const localeFiles = import.meta.glob<{ default: Record<string, never> }>(
  '../locales/*/settings.json',
  { eager: true },
);

/** Every language's name for the pronunciation-voice setting. */
const voiceHeadings = Object.entries(localeFiles)
  .map(([path, module]) => {
    const settings = (module as unknown as { default?: unknown }).default ?? module;
    const title = (settings as { voice?: { title?: string } }).voice?.title;
    return { locale: path.split('/').at(-2)!, title };
  })
  .filter((entry): entry is { locale: string; title: string } => typeof entry.title === 'string');

function open(path: string, element: React.ReactElement) {
  return render(
    <LearnerProvider>
      <LocaleProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path={path}
              element={<AppShell footer={<BottomNavigation />}>{element}</AppShell>}
            />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </LearnerProvider>,
  );
}

const PAGES = [
  ['/me/privacy', <PrivacyPage key="privacy" />] as const,
  ['/me/legal', <LegalPage key="legal" />] as const,
];

describe('legal and informational screens are their own screens', () => {
  it('covers every language the product ships', () => {
    // If a locale ever stops declaring the heading, the text half of this
    // suite silently stops checking that language. Better to know.
    expect(voiceHeadings).toHaveLength(AVAILABLE_LOCALES.length);
  });

  describe.each(PAGES)('%s', (path, element) => {
    it('renders no settings group', async () => {
      const { container } = open(path, element);
      await screen.findByRole('heading', { level: 1 });
      expect(container.querySelectorAll('[data-settings-group]')).toHaveLength(0);
    });

    it('never shows the pronunciation-voice setting, in any language', async () => {
      open(path, element);
      await screen.findByRole('heading', { level: 1 });
      const text = document.body.textContent ?? '';
      for (const { locale, title } of voiceHeadings) {
        expect(text, `${path} shows the ${locale} voice heading`).not.toContain(title);
      }
    });

    it('ends with its own content and the navigation, and nothing between', async () => {
      const { container } = open(path, element);
      await screen.findByRole('heading', { level: 1 });
      /*
       * The page's own root is the last thing inside `<main>`. A screen that
       * has had something appended to it — another route's body, a stray
       * portal — fails here even if that something carries no marker and no
       * recognisable copy.
       */
      const main = container.querySelector('main')!;
      expect(main.children).toHaveLength(1);
    });
  });
});
