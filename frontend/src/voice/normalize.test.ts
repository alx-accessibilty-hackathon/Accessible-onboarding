import { describe, expect, it } from 'vitest';
import type { Step } from '../engine/types';
import {
  matchMultiChoice,
  matchSingleChoice,
  normalizeDate,
  normalizeDigits,
  normalizeName,
  normalizePhone,
  normalizeVoiceInput,
  stripFiller,
} from './normalize';

describe('voice/normalize', () => {
  it('strips English and Amharic filler words', () => {
    expect(stripFiller('um uh Abebe', 'en')).toBe('Abebe');
    expect(stripFiller('እምም አበበ', 'am')).toBe('አበበ');
    expect(stripFiller('like you know Kebede', 'en')).toBe('Kebede');
  });

  it('normalizes names by removing lead-ins and trailing words', () => {
    expect(normalizeName('ስሜ አበበ ከበደ ነው', 'am')).toBe('አበበ ከበደ');
    expect(normalizeName('my name is Abebe Bikila', 'en')).toBe('Abebe Bikila');
    expect(normalizeName('I am Almaz Ayana', 'en')).toBe('Almaz Ayana');
    expect(normalizeName('it is Haile Gebrselassie', 'en')).toBe('Haile Gebrselassie');
  });

  it('normalizes phone numbers and keeps the last spoken number (self-correction)', () => {
    const spoken = 'zero nine one one no zero nine one two three four five six seven eight';
    const result = normalizePhone(spoken, 'en');
    expect(result).toBe('0912 345 678');
  });

  it('normalizes phone numbers with Amharic spoken digits', () => {
    const spoken = 'ዜሮ ዘጠኝ አንድ ሁለት ሶስት አራት አምስት ስድስት ሰባት ስምንት';
    const result = normalizePhone(spoken, 'am');
    expect(result).toBe('0912 345 678');
  });

  it('normalizes phone numbers with Ethiopic numerals', () => {
    const spoken = '09፩፪፫፬፭፮፯፰';
    const result = normalizePhone(spoken, 'am');
    expect(result).toBe('0912 345 678');
  });

  it('normalizes last 4 digits (keeps the last 4 digits heard)', () => {
    expect(normalizeDigits('it ends in 4 8 2 1', 'en')).toBe('4821');
    expect(normalizeDigits('my ID ends in four eight two one', 'en')).toBe('4821');
    expect(normalizeDigits('አራት ስምንት ሁለት አንድ', 'am')).toBe('4821');
    expect(normalizeDigits('12 no 4821', 'en')).toBe('4821');
  });

  it('normalizes dates with Ethiopian month names and digits', () => {
    const resAm = normalizeDate('መስከረም 15 2010', 'am');
    expect(resAm).toContain('15');
    expect(resAm).toContain('መስከረም');
    expect(resAm).toContain('2010');

    const resEn = normalizeDate('15 Meskerem 2010', 'en');
    expect(resEn).toContain('15');
    expect(resEn).toContain('meskerem');
    expect(resEn).toContain('2010');
  });

  it('matches single choice options by label, say words, or spoken index', () => {
    const step: Step = {
      id: 'id_route',
      type: 'single_choice',
      title: 'signup.id_route.title',
      options: [
        { value: 'fayda', label: 'Fayda', say: ['national id'] },
        { value: 'refugee_id', label: 'Refugee ID', say: ['ስደተኛ'] },
        { value: 'none', label: 'None', say: ['የለኝም'] },
      ],
    };

    // Label match
    expect(matchSingleChoice('Fayda', step, 'en')).toBe('fayda');
    // Say word match
    expect(matchSingleChoice('ስደተኛ', step, 'am')).toBe('refugee_id');
    // Number match: "1" or "one" -> first option
    expect(matchSingleChoice('one', step, 'en')).toBe('fayda');
    // Number match: "2" or "ሁለት" -> second option
    expect(matchSingleChoice('ሁለት', step, 'am')).toBe('refugee_id');
  });

  it('matches multi choice options', () => {
    const step: Step = {
      id: 'support_needs',
      type: 'multi_choice',
      title: 'signup.support_needs.title',
      options: [
        { value: 'screen_reader', label: 'Screen reader', say: ['ስክሪን አንባቢ'] },
        { value: 'large_text', label: 'Large text', say: ['ትልቅ ጽሑፍ'] },
        { value: 'quiet_space', label: 'Quiet space' },
      ],
    };

    const res = matchMultiChoice('I need screen reader and large text', step, 'en');
    expect(res).toContain('screen_reader');
    expect(res).toContain('large_text');
    expect(res).not.toContain('quiet_space');
  });

  it('normalizes long text by preserving content and capitalizing first letter', () => {
    const step: Step = {
      id: 'motivation',
      type: 'long_text',
      title: 'application.motivation.title',
    };

    const result = normalizeVoiceInput('um I really want this job because I love coding', step, 'en');
    expect(result).toBe('I really want this job because I love coding');
  });
});
