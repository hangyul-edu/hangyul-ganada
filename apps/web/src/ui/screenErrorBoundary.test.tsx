import { Suspense, lazy } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createI18n } from '../i18n/config';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';

/**
 * A screen that cannot be drawn, and what the learner sees instead.
 *
 * Every screen but Home is a `lazy()` chunk, and a chunk is a fetch the first
 * time. Before this boundary existed, a rejected import unmounted the whole
 * tree — reproduced against the built bundle with a server that 404s one
 * chunk: `#root` had no children, the page was cream and blank, and nothing
 * on it could be tapped. These cases hold the three things the boundary owes
 * the learner: a panel with a way out, a reload that is really a reload, and
 * a Home that is reachable without one.
 */
const i18n = createI18n('en');

/** A route whose chunk never arrives — what a lost connection looks like. */
const Broken = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));

function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link to="/letters">Letters</Link>
    </div>
  );
}

function mount(initial: string, reload = vi.fn()) {
  const view = render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initial]}>
        <ScreenErrorBoundary reload={reload}>
          <Suspense fallback={<div>loading</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/letters" element={<Broken />} />
            </Routes>
          </Suspense>
        </ScreenErrorBoundary>
      </MemoryRouter>
    </I18nextProvider>,
  );
  return { ...view, reload };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a screen whose chunk fails to load', () => {
  it('shows the failed-screen panel instead of an empty tree', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('/letters');

    const panel = await screen.findByRole('alert');
    expect(panel).toHaveTextContent("This screen didn't load");
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/');
  });

  it('reloads the document when asked, because a rejected import never retries itself', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reload } = mount('/letters');

    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('clears the failure when the learner navigates away, and fails again only if they come back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('/letters');

    fireEvent.click(await screen.findByRole('link', { name: 'Go to home' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Letters' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
