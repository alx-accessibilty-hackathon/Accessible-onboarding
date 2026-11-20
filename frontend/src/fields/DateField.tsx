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

/** What was typed, kept while the date is incomplete or doesn't exist (so it can be checked). */
export interface EnteredDate {
  day: string;
  month: string;
  year: string;
}

/** A complete, real date; or (iso "") what was typed so far, which validation then reports. */
export type DateFieldValue = DateAnswerValue | (DateAnswerValue & { entered: EnteredDate });

export interface DateFieldProps {
  step: Step;
  lang: string;
  value: DateFieldValue | null;
  onChange: (value: DateFieldValue | null) => void;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
}

export function DateField({ step, lang, value, onChange, error, headingRef }: DateFieldProps) {
  const defaultCal = step.calendar_default?.[lang] || (lang === 'am' ? 'ethiopian' : 'gregorian');

  const [calendar, setCalendar] = useState<'ethiopian' | 'gregorian'>(
    value?.calendar || defaultCal,
  );

  // Initial internal state from value (a typed-but-unfinished date comes back as typed)
  const entered = value && 'entered' in value ? value.entered : null;
  const [isoYear, isoMonth, isoDay] = (value?.iso ?? '').split('-').map(Number);
  const initialYear = entered
    ? entered.year
    : calendar === 'ethiopian'
      ? (value?.ethiopian?.year ?? '')
      : value?.iso
        ? isoYear
        : '';
  const initialMonth = entered
    ? entered.month
    : calendar === 'ethiopian'
      ? (value?.ethiopian?.month ?? '')
      : value?.iso
        ? isoMonth
        : '';
  const initialDay = entered
    ? entered.day
    : calendar === 'ethiopian'
      ? (value?.ethiopian?.day ?? '')
      : value?.iso
        ? isoDay
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
    const typed: EnteredDate = {
      day: String(newDay).trim(),
      month: String(newMonth).trim(),
      year: String(newYear).trim(),
    };

    // Nothing typed: no answer (an optional question can be skipped).
    if (!typed.day && !typed.month && !typed.year) {
      onChange(null);
      return;
    }
    // Typed in part, or a day that doesn't exist: keep what was typed, so Continue can say
    // what is wrong on this step (instead of the server, at the very end).
    const unfinished = () => onChange({ calendar: c, iso: '', entered: typed });

    if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || !d || !m || !y) {
      unfinished();
      return;
    }

    if (c === 'ethiopian') {
      const maxDays = ethiopianMonthDays(y, m);
      if (d < 1 || d > maxDays || m < 1 || m > 13 || y < 1) {
        unfinished();
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
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 = last of month m
      if (d < 1 || d > daysInMonth || m < 1 || m > 12 || y < 1000 || y > 9999) {
        unfinished();
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
    } else {
      updateDate(targetCal, day, month, year); // unfinished: keep what was typed
    }
  };

  const monthsList = calendar === 'ethiopian' ? ETHIOPIAN_MONTHS : GREGORIAN_MONTHS;

  return (
    <fieldset
      id={fieldsetId}
      aria-describedby={describedBy || undefined}
      // Read aloud: coming into the date from elsewhere says the question first.
      data-bo-context={t(lang, step.title)}
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

      {/* Calendar Switch: a named group of two toggles (read as one choice in Read aloud mode) */}
      <div
        role="group"
        aria-label={t(lang, 'date.calendar')}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-2)',
          marginTop: 'var(--bo-space-1)',
        }}
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

      {/* 3 Input controls: Day, Month, Year (side by side when there is room, else stacked) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-3)',
          alignItems: 'flex-end',
          marginTop: 'var(--bo-space-2)',
        }}
      >
        {/* Day */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--bo-space-1)',
            flex: '1 1 4.5em',
            minWidth: 0,
          }}
        >
          <label
            htmlFor={`${fieldsetId}-day`}
            style={{ fontSize: '0.9em', fontWeight: 600, color: 'var(--bo-text)' }}
          >
            {t(lang, 'date.day')}
          </label>
          {/* Text with a number keypad (not type="number": the arrow keys would change it) */}
          <input
            id={`${fieldsetId}-day`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            autoComplete={calendar === 'gregorian' ? 'bday-day' : 'off'}
            value={day}
            aria-invalid={!!error}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setDay(val);
              updateDate(calendar, val, month, year);
            }}
            style={{
              width: '100%',
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--bo-space-1)',
            flex: '2 1 8em',
            minWidth: 0,
          }}
        >
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
              width: '100%',
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
                {/* The name first, so typing "sep" on a keyboard picks September */}
                {lang === 'am' ? `${m.nameAm} (${m.id})` : `${m.nameEn} (${m.id})`}
              </option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--bo-space-1)',
            flex: '1.2 1 5em',
            minWidth: 0,
          }}
        >
          <label
            htmlFor={`${fieldsetId}-year`}
            style={{ fontSize: '0.9em', fontWeight: 600, color: 'var(--bo-text)' }}
          >
            {t(lang, 'date.year')}
          </label>
          <input
            id={`${fieldsetId}-year`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete={calendar === 'gregorian' ? 'bday-year' : 'off'}
            value={year}
            aria-invalid={!!error}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setYear(val);
              updateDate(calendar, day, month, val);
            }}
            style={{
              width: '100%',
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
