#!/usr/bin/env node
/**
 * The back policy's route table is the router's route list. Neither may drift.
 *
 *   npm run route:policy          print the comparison
 *   npm run route:policy:check    the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * `ui/routePolicy.ts` decides where Back goes, route by route, and it can only
 * do that for routes it has heard of. A route added to `App.tsx` and not to the
 * table falls through to `*`, whose answer is "go Home" — which is a plausible
 * enough behaviour that nobody would file it as a bug, and wrong for every
 * nested screen. The previous shape of this problem was the same shape: a
 * screen shipped without a back control because the prop was optional, and the
 * gate that catches *that* (`back:coverage`) reads the router too, for the same
 * reason. A table typed out by hand is a table that is right on the day it is
 * written.
 *
 * ## What is compared
 *
 * Three things, and each has caught something:
 *
 * 1. **Every router path is in the table**, and every table path is in the
 *    router. A missing entry is a screen with no policy; a stale entry is a
 *    policy for a screen that no longer exists, which is worse because it reads
 *    as coverage.
 * 2. **The order matches.** `ruleFor` walks the table top to bottom exactly as
 *    the router walks its routes, so `/letters/numbers` has to precede
 *    `/letters/:lessonId` in both or the two disagree about which screen a
 *    learner is on. Comparing the sets alone would pass a table whose parameter
 *    routes had floated to the top.
 * 3. **Every parent is itself a route.** A `parent` pointing at a path the
 *    router does not serve sends Back to the not-found screen, which is the one
 *    destination a back control must never have.
 *
 * The router is parsed rather than imported: `App.tsx` pulls in the whole app,
 * including the corpus loader and the font subsetter, and a gate that cheap
 * should not need a DOM.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');

const findings = [];
const fail = (what) => findings.push(what);

// --- the router's own list ---------------------------------------------------

const app = readFileSync(join(root, 'apps/web/src/App.tsx'), 'utf8');
/*
 * `path="…"` on a `<Route>`, in source order.
 *
 * Layout routes carry no path and are skipped by the pattern itself, which is
 * right: a learner is never *at* a layout, and the policy is about where they
 * are. The catch-all is `path="*"` and is included, because it is a screen with
 * a back control on it.
 */
const routerPaths = [...app.matchAll(/<Route\s[^>]*?path="([^"]+)"/gs)].map((m) => m[1]);
if (routerPaths.length === 0) fail('no <Route path="…"> found in App.tsx — has the router moved?');

// --- the policy's table ------------------------------------------------------

const policySource = readFileSync(join(root, 'apps/web/src/ui/routePolicy.ts'), 'utf8');
const table = policySource.slice(
  policySource.indexOf('export const ROUTES'),
  policySource.indexOf('] as const;', policySource.indexOf('export const ROUTES')),
);
const rules = [...table.matchAll(/\{\s*path:\s*'([^']+)'([^}]*)\}/g)].map((m) => ({
  path: m[1],
  kind: /kind:\s*'([a-zA-Z]+)'/.exec(m[2])?.[1] ?? '',
  parent: /parent:\s*(?:'([^']+)'|HOME)/.exec(m[2]) ? (/parent:\s*'([^']+)'/.exec(m[2])?.[1] ?? '/') : undefined,
}));
if (rules.length === 0) fail('no rules parsed out of routePolicy.ts ROUTES');

const policyPaths = rules.map((rule) => rule.path);

// --- 1 and 2: same paths, same order ----------------------------------------

for (const path of routerPaths) {
  if (!policyPaths.includes(path)) fail(`App.tsx serves ${path} and routePolicy.ts has no rule for it`);
}
for (const path of policyPaths) {
  if (!routerPaths.includes(path)) fail(`routePolicy.ts has a rule for ${path}, which App.tsx does not serve`);
}

const shared = policyPaths.filter((path) => routerPaths.includes(path));
const inRouterOrder = routerPaths.filter((path) => policyPaths.includes(path));
/*
 * Order is compared only over the paths that could shadow one another — two
 * routes where one's pattern would match the other's concrete path. Comparing
 * the whole list would fail on `/words` sitting above `/letters/sounds` in one
 * file and below it in the other, which cannot affect any answer.
 */
const segments = (path) => path.split('/').filter(Boolean);
function shadows(pattern, concrete) {
  if (pattern === concrete) return false;
  const a = segments(pattern);
  const b = segments(concrete);
  if (a.length !== b.length) return false;
  return a.every((part, at) => part.startsWith(':') || part === b[at]);
}
for (const pattern of shared) {
  for (const concrete of shared) {
    if (!shadows(pattern, concrete)) continue;
    const policyOrder = policyPaths.indexOf(concrete) < policyPaths.indexOf(pattern);
    const routerOrder = inRouterOrder.indexOf(concrete) < inRouterOrder.indexOf(pattern);
    if (!policyOrder) {
      fail(`routePolicy.ts tries ${pattern} before ${concrete}, so ${concrete} can never match`);
    }
    if (!routerOrder) {
      fail(`App.tsx tries ${pattern} before ${concrete}, so ${concrete} can never match`);
    }
  }
}

// --- 3: every parent is a real route ----------------------------------------

for (const rule of rules) {
  if (rule.kind === 'home') {
    if (rule.parent !== undefined) fail(`${rule.path} is Home and must not declare a parent`);
    continue;
  }
  if (!rule.parent) {
    fail(`${rule.path} declares no parent, so a deep link into it has nowhere to go back to`);
    continue;
  }
  if (!policyPaths.includes(rule.parent)) {
    fail(`${rule.path} declares parent ${rule.parent}, which is not a route`);
  }
  if (rule.parent === rule.path) fail(`${rule.path} is its own parent`);
}

/*
 * And the walk terminates. A parent chain that loops — A's parent is B, B's is
 * A — is a Back button that never reaches Home, which no per-rule check above
 * would notice.
 */
const parentOf = new Map(rules.map((rule) => [rule.path, rule.parent]));
for (const rule of rules) {
  let at = rule.path;
  let steps = 0;
  while (at !== '/' && steps < 10) {
    at = parentOf.get(at) ?? '/';
    steps += 1;
  }
  if (at !== '/') fail(`the parent chain from ${rule.path} does not reach Home`);
}

// --- report ------------------------------------------------------------------

console.log(`routes in App.tsx      ${routerPaths.length}`);
console.log(`rules in routePolicy   ${rules.length}`);
console.log(`  home                 ${rules.filter((r) => r.kind === 'home').length}`);
console.log(`  tab roots            ${rules.filter((r) => r.kind === 'tabRoot').length}`);
console.log(`  nested               ${rules.filter((r) => r.kind === 'nested').length}`);
console.log(`  sittings             ${rules.filter((r) => r.kind === 'session').length}`);

if (findings.length === 0) {
  console.log('\nevery route has a back policy, in the order the router resolves them.');
} else {
  console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}:`);
  for (const finding of findings) console.log(`  - ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
