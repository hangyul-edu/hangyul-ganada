/**
 * The end of the alphabet is never a dead end.
 *
 * The web build has no `HANGYUL_URL`, and until v1.0.5 the earned card then
 * rendered nothing: the fortieth letter was followed by a completed ring and
 * silence. The card now names the next step inside this app. The My Learning
 * row stays absent without a destination, because that screen already lists
 * Today's Words.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { NextStepCard } from './NextStepCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../config/product', () => ({ HANGYUL_URL: null }));

describe('NextStepCard without a hand-off destination', () => {
  it('the earned card names the next step inside the product and links to Words', () => {
    render(
      <MemoryRouter>
        <NextStepCard variant="earned" />
      </MemoryRouter>,
    );
    const card = screen.getByTestId('next-step-in-product');
    expect(card).toHaveTextContent('nextStep.inProduct.title');
    expect(card).toHaveTextContent('nextStep.inProduct.body');
    const link = screen.getByRole('link', { name: 'nextStep.inProduct.cta' });
    expect(link).toHaveAttribute('href', '/words');
  });

  it('the My Learning row stays absent — that screen already lists Today’s Words', () => {
    const { container } = render(
      <MemoryRouter>
        <NextStepCard variant="row" />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('never invents an outward link', () => {
    render(
      <MemoryRouter>
        <NextStepCard variant="earned" />
      </MemoryRouter>,
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^https?:/);
    }
  });
});
