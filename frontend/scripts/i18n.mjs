#!/usr/bin/env node
// Languages are files: every src/i18n/locales/<code>.json is a language (src/i18n/registry.ts).
//
//   npm run i18n:new -- <code> "<name in its own script>" <speech tag>
//       e.g. npm run i18n:new -- om "Afaan Oromoo" om-ET
//       Creates src/i18n/locales/<code>.json from en.json with every text marked "TODO-<code>"
//       (shown in English until translated), plus the language's name and speech tag.
//
//   npm run i18n:check [-- <code>]
//       For every language (or one): keys missing compared with en.json, texts still "TODO-",
//       extra keys en.json doesn't have, and {placeholders} that differ from the English.
//       Exits with 1 if a key is missing or a placeholder differs (TODO texts only warn:
//       they fall back to English on purpose).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src', 'i18n', 'locales');
const read = (code) => JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), 'utf8'));
const placeholders = (s) =>
  [...String(s).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

const [command, ...args] = process.argv.slice(2);

function newLanguage(code, name, speechTag) {
  if (!code || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code) || !name || !speechTag) {
    console.error('Usage: npm run i18n:new -- <code> "<name in its own script>" <speech tag>');
    console.error('  e.g. npm run i18n:new -- om "Afaan Oromoo" om-ET');
    process.exit(1);
  }
  const target = path.join(dir, `${code}.json`);
  if (fs.existsSync(target)) {
    console.error(`${path.relative(root, target)} already exists: nothing changed.`);
    process.exit(1);
  }
  const en = read('en');
  const out = {};
  for (const [key, value] of Object.entries(en)) out[key] = `TODO-${code} ${value}`;
  out['language.name'] = name;
  out['language.speech_tag'] = speechTag;
  fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Created ${path.relative(root, target)} (${Object.keys(out).length} keys).`);
  console.log('Next:');
  console.log(
    '  1. A native speaker replaces every "TODO-' + code + ' …" text (never machine translation).',
  );
  console.log(`  2. npm run i18n:check -- ${code}`);
  console.log(`  3. Add "${code}" to the partner's "languages" setting (GET /config).`);
  console.log(`  4. Optional: read-aloud recordings in public/audio/${code}/<key>.mp3.`);
}

function check(only) {
  const en = read('en');
  const enKeys = Object.keys(en);
  const codes = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((c) => c !== 'en' && (!only || c === only));
  if (only && codes.length === 0) {
    console.error(`No locale file for "${only}".`);
    process.exit(1);
  }
  let failed = false;
  for (const code of codes) {
    const pack = read(code);
    const missing = enKeys.filter((k) => !(k in pack));
    const todo = enKeys.filter((k) => typeof pack[k] === 'string' && pack[k].startsWith('TODO-'));
    const extra = Object.keys(pack).filter((k) => !(k in en));
    const badPlaceholders = enKeys.filter(
      (k) =>
        k in pack &&
        !String(pack[k]).startsWith('TODO-') &&
        placeholders(pack[k]) !== placeholders(en[k]),
    );
    const done = enKeys.length - missing.length - todo.length;
    console.log(
      `\n${code} (${pack['language.name'] ?? '?'}): ${done} of ${enKeys.length} translated`,
    );
    const list = (label, keys) => {
      if (keys.length === 0) return;
      console.log(`  ${label} (${keys.length}):`);
      for (const k of keys.slice(0, 40)) console.log(`    ${k}`);
      if (keys.length > 40) console.log(`    … and ${keys.length - 40} more`);
    };
    list('missing (shown in English)', missing);
    list('still TODO (shown in English)', todo);
    list('not in en.json (unused)', extra);
    list('{placeholders} differ from English', badPlaceholders);
    if (missing.length > 0 || badPlaceholders.length > 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

if (command === 'new') newLanguage(...args);
else if (command === 'check') check(args[0]);
else {
  console.error('Usage: node scripts/i18n.mjs new <code> "<name>" <speech tag> | check [<code>]');
  process.exit(1);
}
