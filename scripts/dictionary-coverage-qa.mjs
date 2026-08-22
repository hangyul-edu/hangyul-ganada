#!/usr/bin/env node
/**
 * Is the dictionary broad enough to be called one?
 *
 *   node scripts/dictionary-coverage-qa.mjs           print the audit
 *   node scripts/dictionary-coverage-qa.mjs --check   fail the build
 *
 * ## Why a coverage audit and not a headword count
 *
 * Because 26,675 sounded like a lot and 왕족 was missing. A count says how much
 * was ingested; it says nothing about whether the words a learner will actually
 * type are in there. So this asks the second question, three ways:
 *
 * 1. **A named fixture** — a few hundred ordinary words across the domains a
 *    general dictionary has to have. Every one is a word a Korean adult uses
 *    without thinking, and a miss is a hole in the ingestion, not bad luck.
 * 2. **Frequency coverage** — what share of the commonest spoken Korean the
 *    dictionary can answer, measured at four depths.
 * 3. **Resolved coverage** — the same, counting a word that reaches its entry
 *    through the morphology or by shedding a particle. This is the number that
 *    matches what a learner experiences, because 때문에 and 학교에서 are what
 *    people type and neither is a headword in any dictionary.
 *
 * ## Why the exact-match figure is low and that is correct
 *
 * A subtitle frequency list is mostly *inflected* Korean: 있어요, 제가, 때문에.
 * §33 forbids those from becoming headwords — a dictionary that listed every
 * conjugation would have a bigger number and be a worse dictionary. So the
 * exact figure is around a fifth and the resolved figure is around three
 * quarters, and it is the second one that describes the product.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpusForNode } from './lib/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

await loadCorpusForNode();
const dictionary = await import('../apps/web/src/data/dictionary.ts');
const index = await dictionary.loadIndex();

/**
 * Ordinary Korean, by domain.
 *
 * Written from the domains §29 lists rather than sampled from the dictionary,
 * which is the point: a fixture drawn from what is already there cannot find
 * what is missing. 귀족 is first because it is the word that started this.
 */
const FIXTURE = {
  'society and rank': ['귀족', '평민', '계급', '신분', '사회', '국민', '시민', '단체', '조직', '제도'],
  'government and law': ['정부', '국가', '법률', '헌법', '재판', '경찰', '선거', '정치', '권리', '의무'],
  'economy and money': ['경제', '금융', '은행', '예금', '투자', '세금', '가격', '시장', '수입', '지출'],
  'work and education': ['직업', '회사', '사무실', '회의', '교육', '학생', '선생', '대학', '시험', '연구'],
  'thought and language': ['철학', '과학', '역사', '문학', '언어', '단어', '문장', '의미', '목적', '가치'],
  'people and relationships': ['가족', '부모', '형제', '친구', '이웃', '관계', '결혼', '사랑', '약속', '인사'],
  'body and health': ['건강', '병원', '의사', '약국', '질병', '치료', '수술', '운동', '휴식', '피로'],
  'food and daily life': ['음식', '식사', '요리', '재료', '시장', '가게', '청소', '빨래', '쓰레기', '생활'],
  'travel and place': ['여행', '공항', '기차', '지하철', '호텔', '지도', '거리', '건물', '도시', '시골'],
  'technology and media': ['기술', '컴퓨터', '전화', '인터넷', '방송', '신문', '기사', '사진', '영화', '음악'],
  'nature and environment': ['환경', '자연', '날씨', '바다', '산', '강', '나무', '동물', '식물', '공기'],
  'time and quantity': ['시간', '오늘', '내일', '주말', '계절', '숫자', '무게', '길이', '속도', '거리'],
  'common verbs': ['하다', '되다', '있다', '없다', '가다', '오다', '보다', '먹다', '만들다', '생각하다'],
  'common adjectives': ['좋다', '나쁘다', '크다', '작다', '많다', '적다', '어렵다', '쉽다', '빠르다', '느리다'],
  'common adverbs': ['아주', '너무', '조금', '다시', '먼저', '항상', '가끔', '벌써', '이미', '아직'],
  'function words': ['것', '수', '때문', '동안', '경우', '정도', '대신', '만큼', '자기', '자신'],
};

const missing = [];
let total = 0;
console.log('Dictionary coverage — the words a general Korean dictionary must have\n');
for (const [domain, words] of Object.entries(FIXTURE)) {
  const gone = words.filter((word) => !dictionary.hasHeadword(index, word));
  total += words.length;
  missing.push(...gone.map((word) => ({ domain, word })));
  const mark = gone.length === 0 ? '  ok ' : '  !!  ';
  console.log(`${mark} ${domain.padEnd(26)} ${words.length - gone.length}/${words.length}${gone.length ? `   missing: ${gone.join(', ')}` : ''}`);
}

/*
 * Words that are genuinely not in the source.
 *
 * Not an excuse list and not a place to hide a failure: each one has been
 * looked up on both Wiktionaries by hand and is absent from both, so no change
 * to the ingestion can find it. If a legally usable source that has them is
 * ever added, this list should empty rather than grow.
 */
const UPSTREAM_GAPS = new Set(['왕족']);

const manifest = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/public/dictionary/manifest.json'), 'utf8'),
);
console.log(
  `\n  headwords ${manifest.headwords.toLocaleString('en')} · senses ${manifest.senses.toLocaleString('en')} · examples ${manifest.examples.toLocaleString('en')}`,
);

// --- frequency coverage --------------------------------------------------------
const tokens = readFileSync(join(ROOT, 'content-cache/ko_50k.txt'), 'utf8')
  .split('\n')
  .map((line) => line.split(' ')[0])
  .filter((word) => word && /^[가-힣]+$/.test(word));

console.log('\n  the commonest spoken Korean, and whether a learner typing it lands somewhere:\n');
console.log('    depth      exact   resolved');
const resolved = [];
for (const depth of [1000, 3000, 5000, 10000]) {
  const top = tokens.slice(0, depth);
  let exact = 0;
  let viaMorphology = 0;
  for (const word of top) {
    if (dictionary.hasHeadword(index, word)) exact += 1;
    else if (dictionary.analyseInflection(index, word).length > 0) viaMorphology += 1;
  }
  const exactShare = (exact / top.length) * 100;
  const allShare = ((exact + viaMorphology) / top.length) * 100;
  resolved.push({ depth, exactShare, allShare });
  console.log(
    `    ${String(depth).padStart(6)}    ${exactShare.toFixed(1).padStart(5)}%     ${allShare.toFixed(1).padStart(5)}%`,
  );
}

const problems = [];
const unexplained = missing.filter((row) => !UPSTREAM_GAPS.has(row.word));
if (unexplained.length > 0) {
  problems.push(
    `${unexplained.length} fixture word(s) missing: ${unexplained.map((r) => r.word).join(', ')}`,
  );
}
if (manifest.headwords < 10_000) {
  problems.push(`only ${manifest.headwords} headwords, under the 10,000 minimum`);
}
const top1000 = resolved.find((row) => row.depth === 1000);
if (top1000 && top1000.allShare < 70) {
  problems.push(`only ${top1000.allShare.toFixed(1)}% of the top 1,000 tokens reach an entry`);
}

const explained = missing.filter((row) => UPSTREAM_GAPS.has(row.word));
if (explained.length > 0) {
  console.log(
    `\n  absent from the source itself, not from the ingestion: ${explained.map((r) => r.word).join(', ')}`,
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ! ${problem}`);
  process.exit(CHECK ? 1 : 0);
}
console.log(
  `\n${total - missing.length} of ${total} fixture words are in the dictionary, and the commonest Korean reaches an entry.`,
);
