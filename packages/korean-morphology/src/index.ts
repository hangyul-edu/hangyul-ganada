export { conjugate, conjugationTable, displayConjugations, takesImperative, FORMS, type Form, type WordShape } from './conjugate';
export { classify, stemOf, type ConjugationClass } from './classes';
export { analyse, formOf, type Analysis } from './analyse';
export { decompose, compose, hasFinal, finalOf, vowelOf, isHangulSyllable, FINALS, VOWELS, INITIALS } from './hangul';
export { compare, normalise, sameLemma, type Difference, type Equivalence } from './equivalence';
export {
  validate,
  type AnswerError,
  type AnswerFacts,
  type Accepted,
  type Rejected,
  type Validation,
  type ValidateOptions,
} from './validate';
