import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NUMBER_LESSONS } from '../data/numbers';
import { learningStreak } from '../domain/activity';
import { MemoryDriver } from '../storage/driver';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
import { LearnerProvider } from './LearnerProvider';

/**
 * The streak, at the layer where the events are real.
 *
 * `domain/streak.test.ts` pins the arithmetic over a set of dates. What it
 * cannot see is which events *produce* a date: that an answered question
 * writes the day and twenty seconds on a session screen does not, that a
 * Numbers answer counts before the lesson completes, that the level test
 * counts for nothing, and that the number a learner sees survives closing
 * and reopening the app. Those are facts about the store, so they are held
 * here, against the store, with the same `MemoryDriver` the persistence
 * fixtures use.
 *
 * The clock is faked so "tomorrow" is a real tomorrow rather than a fixture
 * date: every date key the store writes comes from `new Date()`.
 */

function Probe({ onReady }: { onReady: (value: LearnerContextValue) => void }) {
  return (
    <LearnerContext.Consumer>
      {(value) => (value ? <Live value={value} onReady={onReady} /> : null)}
    </LearnerContext.Consumer>
  );
}

function Live({
  value,
  onReady,
}: {
  value: LearnerContextValue;
  onReady: (value: LearnerContextValue) => void;
}) {
  useEffect(() => {
    onReady(value);
  });
  return null;
}

async function open(driver: MemoryDriver) {
  let current: LearnerContextValue | null = null;
  const view = render(
    <LearnerProvider driver={driver}>
      <Probe onReady={(value) => (current = value)} />
    </LearnerProvider>,
  );
  await waitFor(() => expect(current?.ready).toBe(true));
  return {
    view,
    get context() {
      return current!;
    },
  };
}

/** One answered letter question — the smallest qualifying activity. */
async function answerOne(app: Awaited<ReturnType<typeof open>>, passed = true) {
  await act(async () => {
    app.context.recordAttempt({
      kind: 'character',
      item_key: 'ㄱ',
      result: { passed, score: passed ? 0.9 : 0.2 },
    } as Parameters<LearnerContextValue['recordAttempt']>[0]);
  });
}

const streakOf = (app: Awaited<ReturnType<typeof open>>) =>
  learningStreak(app.context.state.activity, app.context.state.settings.active_days, new Date());

describe('which events make a learning day', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 16, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a learner who has never answered anything has no streak, and is not on Day 0', async () => {
    const app = await open(new MemoryDriver());
    expect(app.context.summary.streak_days).toBe(0);
    expect(streakOf(app).status).toBe('never');
  });

  it('the first answered question is Day 1 — right or wrong', async () => {
    const app = await open(new MemoryDriver());
    await answerOne(app, false);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    expect(streakOf(app)).toMatchObject({ current: 1, longest: 1, totalDays: 1, status: 'active' });
  });

  it('more answers on the same day are still Day 1', async () => {
    const app = await open(new MemoryDriver());
    await answerOne(app);
    await answerOne(app);
    await answerOne(app, false);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    expect(app.context.state.settings.active_days).toEqual(['2026-09-16']);
  });

  it('time on a session screen with no answer is study time, not a streak day', async () => {
    const app = await open(new MemoryDriver());
    await act(async () => {
      app.context.recordStudyTime(20_000);
      app.context.recordStudyTime(20_000);
    });
    await waitFor(() => expect(app.context.state.activity['2026-09-16']?.active_ms).toBe(40_000));
    expect(app.context.summary.streak_days).toBe(0);
    expect(streakOf(app).status).toBe('never');
    expect(app.context.state.settings.active_days).toEqual([]);
  });

  it('sitting the level test is not a learning day', async () => {
    const app = await open(new MemoryDriver());
    await act(async () => {
      app.context.saveLevelTestResult({
        level: 5,
        low: 3,
        high: 7,
        items: 30,
        takenAt: new Date().toISOString(),
        recentItems: [],
      });
    });
    await waitFor(() => expect(app.context.vocabularyLevel).toBe(5));
    expect(app.context.summary.streak_days).toBe(0);
    expect(streakOf(app).status).toBe('never');
  });

  it('an answered Numbers question counts before the lesson is complete', async () => {
    const app = await open(new MemoryDriver());
    const lesson = NUMBER_LESSONS[0]!;
    await act(async () => {
      app.context.recordNumbersEvent(lesson.id, { type: 'lesson_opened' });
      app.context.recordNumbersEvent(lesson.id, {
        type: 'explanation_viewed',
        step: lesson.explanation[0]!.text,
      });
    });
    // Opening and reading are not learning days.
    expect(app.context.summary.streak_days).toBe(0);
    await act(async () => {
      app.context.recordNumbersEvent(lesson.id, {
        type: 'exercise_attempted',
        exercise_id: 'x',
        item_id: lesson.item_ids[0]!,
        correct: false,
        phase: 'practice',
      });
    });
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    expect(app.context.state.activity['2026-09-16']?.attempts).toBe(1);
  });

  it('completing a Numbers lesson is credited once, not once per updater run', async () => {
    const app = await open(new MemoryDriver());
    const lesson = NUMBER_LESSONS[0]!;
    await act(async () => {
      app.context.recordNumbersEvent(lesson.id, { type: 'lesson_opened' });
      for (const step of lesson.explanation) {
        app.context.recordNumbersEvent(lesson.id, { type: 'explanation_viewed', step: step.text });
      }
      for (const id of lesson.item_ids) {
        app.context.recordNumbersEvent(lesson.id, { type: 'example_viewed', item_id: id });
      }
      app.context.recordNumbersEvent(lesson.id, { type: 'practice_completed' });
      for (const id of lesson.item_ids) {
        app.context.recordNumbersEvent(lesson.id, {
          type: 'exercise_attempted',
          exercise_id: `m-${id}`,
          item_id: id,
          correct: true,
          phase: 'mastery',
        });
      }
      app.context.recordNumbersEvent(lesson.id, {
        type: 'mastery_completed',
        correct: lesson.item_ids.length,
        total: lesson.item_ids.length,
      });
    });
    await waitFor(() =>
      expect(app.context.state.numbers[lesson.id]?.completed_at).not.toBeNull(),
    );
    await waitFor(() =>
      expect(app.context.state.activity['2026-09-16']?.numbers_lessons_completed).toBe(1),
    );
    expect(app.context.summary.streak_days).toBe(1);
  });
});

describe('the streak across days and restarts', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 16, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the following day makes Day 2; a missed day starts again at Day 1', async () => {
    const driver = new MemoryDriver();
    let app = await open(driver);
    await answerOne(app);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    app.view.unmount();

    vi.setSystemTime(new Date(2026, 8, 17, 9, 0, 0));
    app = await open(driver);
    // Reopened the next morning before studying: the run is intact at 1.
    expect(app.context.summary.streak_days).toBe(1);
    await answerOne(app);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(2));
    app.view.unmount();

    // A day missed entirely.
    vi.setSystemTime(new Date(2026, 8, 19, 20, 0, 0));
    app = await open(driver);
    expect(app.context.summary.streak_days).toBe(0);
    expect(streakOf(app)).toMatchObject({ status: 'lapsed', longest: 2, totalDays: 2 });
    await answerOne(app);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    expect(streakOf(app)).toMatchObject({ current: 1, longest: 2, totalDays: 3, status: 'active' });
  });

  it('reads the same after the app is closed and reopened', async () => {
    const driver = new MemoryDriver();
    let app = await open(driver);
    await answerOne(app);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    app.view.unmount();
    app = await open(driver);
    expect(app.context.summary.streak_days).toBe(1);
    expect(app.context.state.settings.active_days).toEqual(['2026-09-16']);
  });

  it('a duplicate write of the same day does not double-count', async () => {
    const driver = new MemoryDriver();
    const app = await open(driver);
    await answerOne(app);
    await answerOne(app);
    await waitFor(() => expect(app.context.summary.streak_days).toBe(1));
    expect(app.context.state.settings.active_days.filter((d) => d === '2026-09-16')).toHaveLength(1);
    expect(learningStreak(app.context.state.activity, ['2026-09-16', '2026-09-16'], new Date()).current).toBe(1);
  });

  it('an existing learner’s recorded days are kept as they were', async () => {
    // A profile from before this rule, with three consecutive days written
    // by practice events and a fourth that held only study time.
    const driver = new MemoryDriver();
    let app = await open(driver);
    vi.setSystemTime(new Date(2026, 8, 13, 12, 0, 0));
    await answerOne(app);
    vi.setSystemTime(new Date(2026, 8, 14, 12, 0, 0));
    await answerOne(app);
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0));
    await answerOne(app);
    vi.setSystemTime(new Date(2026, 8, 16, 12, 0, 0));
    await act(async () => {
      app.context.recordStudyTime(30_000);
    });
    await waitFor(() => expect(app.context.state.activity['2026-09-16']?.active_ms).toBe(30_000));
    app.view.unmount();

    app = await open(driver);
    // Three learning days, the run alive through yesterday; today's viewing
    // is recorded as time and not as a fourth day.
    expect(app.context.state.settings.active_days).toEqual(['2026-09-13', '2026-09-14', '2026-09-15']);
    expect(app.context.summary.streak_days).toBe(3);
    expect(streakOf(app).totalDays).toBe(3);
    expect(app.context.state.activity['2026-09-16']?.active_ms).toBe(30_000);
  });
});
