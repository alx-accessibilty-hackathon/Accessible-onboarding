import { useState, type RefObject } from 'react';
import type { Step } from '../engine/types';
import { t } from '../i18n/t';
import {
  ETHIOPIAN_MONTHS,
  GREGORIAN_MONTHS,
  ethiopianMonthDays,
  ethiopianToGregorian,
  formatIsoDate,
  gregorianToEthiopian,
  type DateAnswerValue,
} from '../lib/ethiopianCalendar';

export interface DateFieldProps {
  step: Step;
  lang: string;
  value: DateAnswerValue | null;
  onChange: (value: DateAnswerValue | null) => void;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
}

export function DateField({ step, lang, value, onChange, error, headingRef }: DateFieldProps) {
  const defaultCal = step.calendar_default?.[lang] || (lang === 'am' ? 'ethiopian' : 'gregorian');

  const [calendar, setCalendar] = useState<'ethiopian' | 'gregorian'>(
    value?.calendar || defaultCal,
  );

  // Initial internal state from value
  const initialYear =
    calendar === 'ethiopian'
      ? (value?.ethiopian?.year ?? '')
      : value?.iso
        ? new Date(value.iso).getUTCFullYear()
        : '';
  const initialMonth =
    calendar === 'ethiopian'
      ? (value?.ethiopian?.month ?? '')
      : value?.iso
        ? new Date(value.iso).getUTCMonth() + 1
        : '';
  const initialDay =
    calendar === 'ethiopian'
      ? (value?.ethiopian?.day ?? '')
      : value?.iso
        ? new Date(value.iso).getUTCDate()
        : '';

  const [day, setDay] = useState<string | number>(initialDay);
  const [month, setMonth] = useState<string | number>(initialMonth);
  const [year, setYear] = useState<string | number>(initialYear);

  const fieldsetId = `q-${step.id}`;
  const hintId = `${fieldsetId}-hint`;
  const errorId = `${fieldsetId}-error`;

  const describedBy = [step.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  const updateDate = (
    c: 'ethiopian' | 'gregorian',
    newDay: string | number,
    newMonth: string | number,
    newYear: string | number,
  ) => {
    const d = Number(newDay);
    const m = Number(newMonth);
    const y = Number(newYear);

    if (!d || !m || !y || isNaN(d) || isNaN(m) || isNaN(y)) {
      // Partial or empty
      onChange(null);
      return;
    }

    if (c === 'ethiopian') {
      const maxDays = ethiopianMonthDays(y, m);
      if (d < 1 || d > maxDays || m < 1 || m > 13 || y < 1) {
        onChange(null);
        return;
      }
      const gr = ethiopianToGregorian(y, m, d);
      const iso = formatIsoDate(gr.year, gr.month, gr.day);
      onChange({
        calendar: 'ethiopian',
        ethiopian: { year: y, month: m, day: d },
        iso,
      });
    } else {
      if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) {
        onChange(null);
        return;
      }
      const et = gregorianToEthiopian(y, m, d);
      const iso = formatIsoDate(y, m, d);
      onChange({
        calendar: 'gregorian',
        ethiopian: et,
        iso,
      });
    }
  };

  const handleCalendarToggle = (targetCal: 'ethiopian' | 'gregorian') => {
    if (targetCal === calendar) return;
    setCalendar(targetCal);

    // If we have a valid date, convert the values
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    if (d && m && y && !isNaN(d) && !isNaN(m) && !isNaN(y)) {
      if (targetCal === 'gregorian') {
        const gr = ethiopianToGregorian(y, m, d);
        setDay(gr.day);
        setMonth(gr.month);
        setYear(gr.year);
        updateDate('gregorian', gr.day, gr.month, gr.year);
      } else {
        const et = gregorianToEthiopian(y, m, d);
        setDay(et.day);
        setMonth(et.month);
        setYear(et.year);
        updateDate('ethiopian', et.day, et.month, et.year);
      }
    }
  };

  const monthsList = calendar === 'ethiopian' ? ETHIOPIAN_MONTHS : GREGORIAN_MONTHS;

  return (
    <fieldset
      id={fieldsetId}
      aria-describedby={describedBy || undefined}
      style={{
        border: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bo-space-3)',
      }}
    >
      <legend style={{ padding: 0, margin: 0, width: '100%' }}>
        <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
          {t(lang, step.title)}
        </h1>
      </legend>

      {step.hint && (
        <p id={hintId} className="bo-hint" style={{ margin: 0 }}>
          {t(lang, step.hint)}
        </p>
      )}

      {/* Calendar Switch */}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bo-space-2)', marginTop: '4px' }}
      >
        <button
          type="button"
          onClick={() => handleCalendarToggle('ethiopian')}
          aria-pressed={calendar === 'ethiopian'}
          className={calendar === 'ethiopian' ? 'bo-btn bo-btn-primary' : 'bo-btn bo-btn-secondary'}
          style={{ padding: '0.4em 0.8em', fontSize: '0.9em' }}
        >
          {t(lang, 'date.ethiopian')}
        </button>
        <button
          type="button"
          onClick={() => handleCalendarToggle('gregorian')}
          aria-pressed={calendar === 'gregorian'}
          className={calendar === 'gregorian' ? 'bo-btn bo-btn-primary' : 'bo-btn bo-btn-secondary'}
          style={{ padding: '0.4em 0.8em', fontSize: '0.9em' }}
        >
          {t(lang, 'date.gregorian')}
        </button>
      </div>

      {error && (
        <p
          id={errorId}
          style={{
            margin: 0,
            color: 'var(--bo-error)',
            fontWeight: 600,
            fontSize: '0.95em',
          }}
        >
          <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
          {t(lang, `errors.${error}`)}
        </p>
      )}

      {/* 3 Input controls: Day, Month, Year */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(60px, 1fr) minmax(140px, 2fr) minmax(80px, 1.2fr)',
          gap: 'var(--bo-space-3)',
          alignItems: 'end',
          marginTop: 'var(--bo-space-2)',
        }}
      >
        {/* Day */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            htmlFor={`${fieldsetId}-day`}
            style={{ fontSize: '0.9em', fontWeight: 600, color: 'var(--bo-text)' }}
          >
            {t(lang, 'date.day')}
          </label>
          <input
            id={`${fieldsetId}-day`}
            type="number"
            inputMode="numeric"
            min={1}
            max={calendar === 'ethiopian' ? (Number(month) === 13 ? 6 : 30) : 31}
            autoComplete={calendar === 'gregorian' ? 'bday-day' : 'off'}
            value={day}
            aria-invalid={!!error}
            onChange={(e) => {
              const val = e.target.value;
              setDay(val);
              updateDate(calendar, val, month, year);
            }}
            style={{
              minHeight: 'var(--bo-target)',
              padding: '0.5em',
              fontSize: 'inherit',
              borderRadius: 'var(--bo-radius)',
              border: error ? '2px solid var(--bo-error)' : '2px solid var(--bo-border-strong)',
              backgroundColor: 'var(--bo-bg)',
              color: 'var(--bo-text)',
            }}
          />
        </div>

        {/* Month */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            htmlFor={`${fieldsetId}-month`}
            style={{ fontSize: '0.9em', fontWeight: 600, color: 'var(--bo-text)' }}
          >
            {t(lang, 'date.month')}
          </label>
          <select
            id={`${fieldsetId}-month`}
            autoComplete={calendar === 'gregorian' ? 'bday-month' : 'off'}
            value={month}
            aria-invalid={!!error}
            onChange={(e) => {
              const val = e.target.value;
              setMonth(val);
              updateDate(calendar, day, val, year);
            }}
            style={{
              minHeight: 'var(--bo-target)',
              padding: '0.5em',
              fontSize: 'inherit',
              borderRadius: 'var(--bo-radius)',
              border: error ? '2px solid var(--bo-error)' : '2px solid var(--bo-border-strong)',
              backgroundColor: 'var(--bo-bg)',
              color: 'var(--bo-text)',
            }}
          >
            <option value="">{t(lang, 'date.select_month')}</option>
            {monthsList.map((m) => (
              <option key={m.id} value={m.id}>
                {lang === 'am' ? `${m.id}. ${m.nameAm}` : `${m.id} - ${m.nameEn}`}
              </option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            htmlFor={`${fieldsetId}-year`}
            style={{ fontSize: '0.9em', fontWeight: 600, color: 'var(--bo-text)' }}
          >
            {t(lang, 'date.year')}
          </label>
          <input
            id={`${fieldsetId}-year`}
            type="number"
            inputMode="numeric"
            min={1900}
            max={calendar === 'ethiopian' ? 2030 : 2040}
            autoComplete={calendar === 'gregorian' ? 'bday-year' : 'off'}
            value={year}
            aria-invalid={!!error}
            onChange={(e) => {
              const val = e.target.value;
              setYear(val);
              updateDate(calendar, day, month, val);
            }}
            style={{
              minHeight: 'var(--bo-target)',
              padding: '0.5em',
              fontSize: 'inherit',
              borderRadius: 'var(--bo-radius)',
              border: error ? '2px solid var(--bo-error)' : '2px solid var(--bo-border-strong)',
              backgroundColor: 'var(--bo-bg)',
              color: 'var(--bo-text)',
            }}
          />
        </div>
      </div>
    </fieldset>
  );
}
