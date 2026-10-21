#!/usr/bin/env node
/**
 * Downloads country flag PNGs from flagcdn.com into public/.
 *   w160 -> public/flags/    (arena textures + feed thumbnails)
 *   w320 -> public/flags-lg/ (champion screen + confetti sampling)
 *
 * Idempotent: existing non-empty valid PNGs are skipped (pass --force to redownload).
 * Validates the static country list in src/data/countries.ts against
 * https://flagcdn.com/codes.json before downloading.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [
  { dir: path.join(ROOT, 'public', 'flags'), w: 160 },
  { dir: path.join(ROOT, 'public', 'flags-lg'), w: 320 },
];
const CODES_JSON_URL = 'https://flagcdn.com/en/codes.json';
const CONCURRENCY = 8;
const RETRIES = 3;
const RETRY_DELAY_MS = 600;
const FORCE = process.argv.includes('--force');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function readCountryCodes() {
  const src = await readFile(path.join(ROOT, 'src', 'data', 'countries.ts'), 'utf8');
  const codes = [...src.matchAll(/code:\s*'([a-z]{2})'/g)].map((m) => m[1]);
  if (codes.length !== 195) {
    fail(`src/data/countries.ts parsed ${codes.length} codes, expected 195`);
  }
  if (new Set(codes).size !== codes.length) {
    fail('duplicate country codes detected in countries.ts');
  }
  return codes;
}

async function fetchWithRetry(url, label) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error(`suspiciously small (${buf.length} bytes)`);
      if (!buf.subarray(0, 8).equals(PNG_SIGNATURE) && !url.endsWith('.json')) {
        throw new Error('not a PNG payload');
      }
      return buf;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw new Error(`${label}: ${lastErr.message}`);
}

async function isValidPng(file) {
  try {
    const st = await stat(file);
    if (st.size < 100) return false;
    const { open } = await import('node:fs/promises');
    const fh = await open(file, 'r');
    try {
      const sig = Buffer.alloc(8);
      await fh.read(sig, 0, 8, 0);
      return sig.equals(PNG_SIGNATURE);
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

async function main() {
  const codes = await readCountryCodes();

  let remote;
  try {
    const res = await fetch(CODES_JSON_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Supports both the newer { "ad": "Andorra", ... } map and the older [{code,name}] array.
    remote = Array.isArray(json) ? json.map((e) => e.code) : Object.keys(json);
  } catch (err) {
    if (FORCE || SIZES.every(({ dir }) => codes.every((c) => existsSync(path.join(dir, `${c}.png`))))) {
      console.log(`! could not reach ${CODES_JSON_URL} (${err.message}); continuing with cached files`);
      remote = null;
    } else {
      fail(`could not fetch ${CODES_JSON_URL}: ${err.message} (and local flags are missing — run with network access once)`);
    }
  }

  if (remote) {
    const remoteCodes = new Set(remote);
    const missing = codes.filter((c) => !remoteCodes.has(c));
    if (missing.length > 0) {
      fail(`codes not present on flagcdn: ${missing.join(', ')}`);
    }
  }

  for (const { dir } of SIZES) {
    await mkdir(dir, { recursive: true });
  }

  const tasks = [];
  for (const { dir, w } of SIZES) {
    for (const code of codes) {
      tasks.push({ code, dir, w, file: path.join(dir, `${code}.png`) });
    }
  }

  let downloaded = 0;
  let skipped = 0;
  const failures = [];
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      if (!FORCE && (await isValidPng(task.file))) {
        skipped++;
        continue;
      }
      try {
        const buf = await fetchWithRetry(`https://flagcdn.com/w${task.w}/${task.code}.png`, `${task.code}@w${task.w}`);
        await writeFile(task.file, buf);
        downloaded++;
      } catch (err) {
        failures.push(err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`✓ ${downloaded} downloaded, ${skipped} already present, ${tasks.length} total expected`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`✗ ${f}`);
    fail(`${failures.length} downloads failed after ${RETRIES} retries each`);
  }

  // Verify the full set exists and is valid.
  for (const { dir } of SIZES) {
    for (const code of codes) {
      if (!(await isValidPng(path.join(dir, `${code}.png`)))) {
        fail(`missing or invalid after download: ${path.join(dir, `${code}.png`)}`);
      }
    }
  }
  console.log(`✓ verified ${codes.length * SIZES.length} files (${codes.length} codes x ${SIZES.length} sizes)`);
}

main().catch((err) => fail(err.stack || String(err)));
