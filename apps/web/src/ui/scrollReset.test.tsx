/**
 * A new screen starts at the top.
 *
 * The bug this defends against is easy to write and easy to miss: scroll a
 * lesson to the bottom, tap Next, and the next letter opens halfway down —
 * because the container that scrolled was never reset, and the obvious fix
 * (`window.scrollTo(0, 0)`) resets a window that was never scrolled and
 * silently changes nothing.
 *
 * So these tests scroll the **real** containers — `AppShell`'s `<main>` for a
 * tabbed screen, `FocusScreen`'s middle row for a learning one — and assert on
 * `scrollTop` after a navigation and after moving to the next item.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppShell } from './AppShell';
import { FocusScreen } from './FocusScreen';
import { LearnerProvider } from '../store/LearnerProvider';

/** jsdom has no layout, so a scroll box has to be given one to scroll. */
function scrollable(element: HTMLElement, height = 2000) {
  Object.defineProperty(element, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: 600, configurable: true });
}

function Tabbed() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <p>tab screen</p>
      <button type="button" onClick={() => navigate('/words')}>
        go to words
      </button>
    </AppShell>
  );
}

function OtherTab() {
  return (
    <AppShell>
      <p>words screen</p>
    </AppShell>
  );
}

describe('scroll reset', () => {
  it('a tab screen scrolled to the bottom opens the next screen at the top', async () => {
    const user = userEvent.setup();
    render(
      <LearnerProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Tabbed />} />
            <Route path="/words" element={<OtherTab />} />
          </Routes>
        </MemoryRouter>
      </LearnerProvider>,
    );

    const main = document.querySelector('main')!;
    scrollable(main);
    main.scrollTop = 1400;
    expect(main.scrollTop).toBe(1400);

    await user.click(screen.getByRole('button', { name: 'go to words' }));
    expect(screen.getByText('words screen')).toBeInTheDocument();
    expect(document.querySelector('main')!.scrollTop).toBe(0);
  });

  it('a learning screen scrolled to the bottom opens the next item at the top', async () => {
    const user = userEvent.setup();

    function Lesson() {
      const [index, setIndex] = useState(0);
      return (
        <FocusScreen
          resetKey={`letter:${index}`}
          footer={
            <button type="button" onClick={() => setIndex((n) => n + 1)}>
              next letter
            </button>
          }
        >
          <p data-testid="letter">letter {index}</p>
        </FocusScreen>
      );
    }

    const { container } = render(<Lesson />);
    const scroll = container.querySelector('[data-scroll-region="focus"]') as HTMLElement;
    scrollable(scroll);
    scroll.scrollTop = 1200;

    await user.click(screen.getByRole('button', { name: 'next letter' }));
    expect(screen.getByTestId('letter')).toHaveTextContent('letter 1');
    expect(scroll.scrollTop).toBe(0);
  });

  it('opening a sheet on the same item leaves the scroll position alone', async () => {
    const user = userEvent.setup();

    function Lesson() {
      const [sheet, setSheet] = useState(false);
      return (
        <FocusScreen resetKey="letter:0">
          <p>letter 0</p>
          <button type="button" onClick={() => setSheet((open) => !open)}>
            toggle sheet
          </button>
          {sheet && <p>sheet</p>}
        </FocusScreen>
      );
    }

    const { container } = render(<Lesson />);
    const scroll = container.querySelector('[data-scroll-region="focus"]') as HTMLElement;
    scrollable(scroll);
    scroll.scrollTop = 900;

    await user.click(screen.getByRole('button', { name: 'toggle sheet' }));
    expect(screen.getByText('sheet')).toBeInTheDocument();
    expect(scroll.scrollTop).toBe(900);

    await user.click(screen.getByRole('button', { name: 'toggle sheet' }));
    expect(scroll.scrollTop).toBe(900);
  });

  it('answering the question does not scroll the learner away from their answer', async () => {
    const user = userEvent.setup();

    function Question() {
      const [picked, setPicked] = useState<string | null>(null);
      return (
        <FocusScreen resetKey="question:1">
          <p>question</p>
          <button type="button" onClick={() => setPicked('ㅏ')}>
            answer
          </button>
          {picked && <p>feedback</p>}
        </FocusScreen>
      );
    }

    const { container } = render(<Question />);
    const scroll = container.querySelector('[data-scroll-region="focus"]') as HTMLElement;
    scrollable(scroll);
    scroll.scrollTop = 400;

    await user.click(screen.getByRole('button', { name: 'answer' }));
    expect(screen.getByText('feedback')).toBeInTheDocument();
    expect(scroll.scrollTop).toBe(400);
  });
});
