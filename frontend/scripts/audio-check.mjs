#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const enJsonPath = path.join(root, 'src', 'i18n', 'locales', 'en.json');
const publicAudioDir = path.join(root, 'public', 'audio');

if (!fs.existsSync(enJsonPath)) {
  console.error(`Error: ${enJsonPath} not found`);
  process.exit(1);
}

const en = JSON.parse(fs.readFileSync(enJsonPath, 'utf8'));
const keys = Object.keys(en);

// Priority 1: Questions and hints (Must)
// Priority 2: Choices and options (Should)
const questionKeys = keys.filter(
  (k) => k.endsWith('.title') || k.endsWith('.hint') || k.startsWith('signup.') || k.startsWith('application.')
);

console.log(`Checking audio files for ${questionKeys.length} priority keys in English and Amharic...`);

const missing = { en: [], am: [] };
const found = { en: [], am: [] };

for (const lang of ['en', 'am']) {
  const langDir = path.join(publicAudioDir, lang);
  const exists = fs.existsSync(langDir);
  if (!exists) {
    fs.mkdirSync(langDir, { recursive: true });
  }

  for (const key of questionKeys) {
    const filePath = path.join(langDir, `${key}.mp3`);
    if (fs.existsSync(filePath)) {
      found[lang].push(key);
    } else {
      missing[lang].push(key);
    }
  }
}

console.log('\n--- Audio Status Report ---');
console.log(`English: ${found.en.length} found, ${missing.en.length} missing`);
console.log(`Amharic: ${found.am.length} found, ${missing.am.length} missing`);

if (missing.en.length > 0) {
  console.log('\nMissing English audio files:');
  missing.en.slice(0, 10).forEach((k) => console.log(`  - public/audio/en/${k}.mp3`));
  if (missing.en.length > 10) console.log(`  ... and ${missing.en.length - 10} more`);
}

if (missing.am.length > 0) {
  console.log('\nMissing Amharic audio files:');
  missing.am.slice(0, 10).forEach((k) => console.log(`  - public/audio/am/${k}.mp3`));
  if (missing.am.length > 10) console.log(`  ... and ${missing.am.length - 10} more`);
}

console.log('\nNote: Missing English files use browser SpeechSynthesis as fallback.');
console.log('Done.\n');
