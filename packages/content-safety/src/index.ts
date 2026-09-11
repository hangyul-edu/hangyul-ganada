export { POLICY, POLICY_VERSION, CATEGORIES } from './policy';
export type { Category, Concept, ContextRule, MatchMode, Policy, Severity } from './policy';
export { normalize, compactTerm } from './normalize';
export {
  evaluateSurface,
  evaluateItem,
  classifyGloss,
  verdictOf,
  isBlocked,
  resetCompiled,
  createEvaluator,
} from './evaluate';
export type { Evaluator, Finding, ItemFacts, ItemResult, Role, Surface, Verdict } from './evaluate';
export { runtimeEvaluator, RUNTIME_POLICY_VERSION } from './runtime';
