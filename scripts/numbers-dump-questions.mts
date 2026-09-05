/**
 * Every Numbers question the engine can build, as JSON on stdout.
 *
 *   npx tsx scripts/numbers-dump-questions.mts     (run from apps/web)
 *
 * The gates that read it — `numbers:domain` and the question ledger — are
 * Node scripts, and the generator is TypeScript inside the app. This is the one
 * place the two meet, so it does nothing but call the real builders and flatten
 * what they return: no filtering, no interpretation, no second opinion about
 * what an option means. Anything a checker needs to know about an option is
 * copied here from the *item*, so the checker never has to look a string up.
 */
import {
  NUMBER_LESSONS,
  getNumberItem,
} from '../apps/web/src/data/numbers';
import {
  MEANING_PROMPT_KEY,
  PROMPT_KEY_FOR_TYPE,
  masteryExercises,
  practiceExercises,
} from '../apps/web/src/features/numbers/exercises';

/** Three attempts, because the generator is seeded on the attempt number. */
const ATTEMPTS = [0, 1, 2];

const lessonOrder = NUMBER_LESSONS.map((lesson) => lesson.id);
const questions: unknown[] = [];

for (const [lessonIndex, lesson] of NUMBER_LESSONS.entries()) {
  for (const attempt of ATTEMPTS) {
    const runs: Array<[string, ReturnType<typeof practiceExercises>]> = [
      ['practice', practiceExercises(lesson, attempt)],
      ['mastery', masteryExercises(lesson, attempt)],
      ['practice-soundfree', practiceExercises(lesson, attempt, { soundFree: true })],
      ['mastery-soundfree', masteryExercises(lesson, attempt, { soundFree: true })],
    ];
    for (const [run, exercises] of runs) {
      for (const exercise of exercises) {
        const item = getNumberItem(exercise.item_id);
        const promptKey =
          exercise.question_type === 'chooseMeaning'
            ? MEANING_PROMPT_KEY[exercise.schema.answerDomain]
            : (exercise.prompt.key ?? PROMPT_KEY_FOR_TYPE[exercise.question_type]);
        questions.push({
          run,
          attempt,
          lesson: lesson.id,
          lessonIndex,
          itemId: exercise.item_id,
          itemKorean: item?.korean ?? null,
          itemAudio: item?.audio.word ?? null,
          kind: exercise.kind,
          answer: exercise.answer,
          promptKey,
          promptText: exercise.prompt.text ?? null,
          schema: exercise.schema,
          options: exercise.options.map((option) => {
            const source = option.itemId ? getNumberItem(option.itemId) : undefined;
            return {
              text: option.text,
              rendered: option.value !== undefined ? String(option.value) : option.text,
              isKey: Boolean(option.isKey),
              misconception: option.misconception,
              domain: option.domain,
              role: source?.role,
              clock: source?.clock,
              glossGroup: source?.gloss_group,
              slotGroup: source?.slot_group,
              taughtAt: source
                ? NUMBER_LESSONS.findIndex((l) => l.item_ids.includes(source.id))
                : undefined,
            };
          }),
        });
      }
    }
  }
}

process.stdout.write(JSON.stringify({ lessonOrder, questions }));
