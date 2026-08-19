#!/usr/bin/env node
/**
 * Checks a built Android artifact against Google Play's 16 KB page-size rule.
 *
 *   node scripts/audit-native-libs.mjs <path-to.apk|.aab> [...]
 *
 * ## What the rule is
 *
 * Android 15 introduced devices whose kernel uses 16 KB memory pages instead of
 * 4 KB. A native library linked for 4 KB pages will not load on one. Google Play
 * requires every app targeting API 35 or higher to be compatible, with
 * enforcement from 1 February 2027.
 *
 * ## Why this script exists rather than a note in the Gradle file
 *
 * Hangyul ganada ships no NDK code of its own and Capacitor's Android runtime is
 * pure Java and Kotlin, so today the app contains no `.so` file at all and is
 * compatible by construction. That is a fact about the *artifact*, not a
 * promise: one dependency added in a future release — a database, an image
 * codec, an analytics SDK — would bring native libraries in without anyone
 * deciding to. So the check reads the built file.
 *
 * Two things are verified, because either one alone can be true while the app
 * is broken:
 *
 * 1. **ELF segment alignment.** Every `PT_LOAD` segment of every `.so` must be
 *    aligned to at least 16384 bytes. This is the actual requirement; a library
 *    that fails it will not load on a 16 KB device.
 * 2. **Zip alignment.** Libraries stored uncompressed must start on a 16 KB
 *    boundary inside the archive so they can be mapped directly. This is what
 *    `useLegacyPackaging false` and AGP 8.5.1+ handle, and what `zipalign -P 16`
 *    would confirm.
 *
 * The ELF parsing is done here rather than shelled out to `llvm-objdump`,
 * because the NDK is not installed in every environment that builds this app
 * and a check that silently skips is worse than no check.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

/** The page size Google Play requires support for. */
const REQUIRED_ALIGNMENT = 16 * 1024;

const ELF_MAGIC = 0x7f454c46;
const PT_LOAD = 1;

/**
 * Every `PT_LOAD` segment's alignment, from a 64-bit or 32-bit ELF.
 *
 * The program header table is the only part of the file this needs, and its
 * location and entry size are both in the ELF header, so there is no guessing.
 */
function loadSegmentAlignments(buffer) {
  if (buffer.length < 64 || buffer.readUInt32BE(0) !== ELF_MAGIC) return null;

  const is64 = buffer[4] === 2;
  const littleEndian = buffer[5] === 1;
  const u16 = (offset) =>
    littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const u32 = (offset) =>
    littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const u64 = (offset) =>
    littleEndian ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset);

  // e_phoff, e_phentsize, e_phnum sit at different offsets in the two classes.
  const phoff = is64 ? Number(u64(0x20)) : u32(0x1c);
  const phentsize = u16(is64 ? 0x36 : 0x2a);
  const phnum = u16(is64 ? 0x38 : 0x2c);

  const alignments = [];
  for (let index = 0; index < phnum; index += 1) {
    const entry = phoff + index * phentsize;
    if (entry + phentsize > buffer.length) break;
    if (u32(entry) !== PT_LOAD) continue;
    // p_align is the last field of the program header in both classes.
    alignments.push(is64 ? Number(u64(entry + 0x30)) : u32(entry + 0x1c));
  }
  return alignments;
}

/** Lists archive members with their compression and offset, via `unzip -v`. */
function listArchive(archive) {
  // `unzip -v` is present anywhere the Android tooling is, and unlike a Node zip
  // library it reports the *stored* offset, which is what alignment is about.
  const output = execFileSync('unzip', ['-v', archive], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 8 && /\.so$/.test(parts[parts.length - 1]))
    .map((parts) => ({ name: parts[parts.length - 1], method: parts[4] }));
}

function auditArchive(archive) {
  const findings = [];
  const libraries = listArchive(archive);

  if (libraries.length === 0) {
    return {
      archive,
      libraries: 0,
      findings,
      note:
        'no native libraries — 16 KB compatible by construction, ' +
        'because there is nothing to align',
    };
  }

  const scratch = mkdtempSync(join(tmpdir(), 'hg-nativelibs-'));
  try {
    for (const library of libraries) {
      if (library.method !== 'Stored') {
        findings.push(
          `${library.name} is compressed (${library.method}); it cannot be mapped ` +
            'directly, so set `useLegacyPackaging false`',
        );
      }
      execFileSync('unzip', ['-o', '-q', archive, library.name, '-d', scratch]);
      const alignments = loadSegmentAlignments(readFileSync(join(scratch, library.name)));
      if (alignments === null) {
        findings.push(`${library.name} is not an ELF file`);
        continue;
      }
      for (const alignment of alignments) {
        if (alignment < REQUIRED_ALIGNMENT) {
          findings.push(
            `${library.name} has a PT_LOAD segment aligned to ${alignment} bytes; ` +
              `${REQUIRED_ALIGNMENT} is required and it will not load on a 16 KB device`,
          );
        }
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  return { archive, libraries: libraries.length, findings, note: null };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node scripts/audit-native-libs.mjs <path-to.apk|.aab> [...]');
  process.exit(2);
}

let failed = false;
for (const target of targets) {
  if (!existsSync(target)) {
    console.error(`✗ ${target} does not exist`);
    failed = true;
    continue;
  }
  const result = auditArchive(target);
  const label = basename(result.archive);
  if (result.findings.length > 0) {
    failed = true;
    console.error(`✗ ${label}: ${result.findings.length} problem(s)`);
    for (const finding of result.findings) console.error(`    ${finding}`);
  } else if (result.note) {
    console.log(`✓ ${label}: ${result.note}`);
  } else {
    console.log(`✓ ${label}: ${result.libraries} native librar(y|ies), all 16 KB aligned`);
  }
}

process.exit(failed ? 1 : 0);
