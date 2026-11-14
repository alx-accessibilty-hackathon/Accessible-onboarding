const ETHIOPIC_EPOCH = 1724221; // JDN of 1 Meskerem, year 1 (Amete Mihret)

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface DateAnswerValue {
  calendar: 'ethiopian' | 'gregorian';
  ethiopian?: CalendarDate;
  iso: string;
}

export function isEthiopianLeapYear(year: number): boolean {
  // In the Ethiopian calendar, every 4th year is a leap year with no exception: year % 4 === 3
  return year % 4 === 3;
}

export function ethiopianMonthDays(year: number, month: number): number {
  if (month >= 1 && month <= 12) return 30;
  if (month === 13) return isEthiopianLeapYear(year) ? 6 : 5;
  return 0;
}

export function isValidEthiopianDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 13 || day < 1) return false;
  return day <= ethiopianMonthDays(year, month);
}

export function ethiopianToJdn(year: number, month: number, day: number): number {
  return ETHIOPIC_EPOCH + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
}

export function jdnToEthiopian(jdn: number): CalendarDate {
  const d = jdn - ETHIOPIC_EPOCH;
  const cycle = Math.floor(d / 1461);
  let r = d % 1461;
  const lengths = [365, 365, 366, 365];
  let i = 0;
  while (r >= lengths[i]) {
    r -= lengths[i];
    i++;
  }
  return {
    year: cycle * 4 + i + 1,
    month: Math.floor(r / 30) + 1,
    day: (r % 30) + 1,
  };
}

export function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

export function jdnToGregorian(jdn: number): CalendarDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function ethiopianToGregorian(year: number, month: number, day: number): CalendarDate {
  const jdn = ethiopianToJdn(year, month, day);
  return jdnToGregorian(jdn);
}

export function gregorianToEthiopian(year: number, month: number, day: number): CalendarDate {
  const jdn = gregorianToJdn(year, month, day);
  return jdnToEthiopian(jdn);
}

export function formatIsoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const ETHIOPIAN_MONTHS = [
  { id: 1, nameEn: 'Meskerem', nameAm: 'መስከረም' },
  { id: 2, nameEn: 'Tikimt', nameAm: 'ጥቅምት' },
  { id: 3, nameEn: 'Hidar', nameAm: 'ኅዳር' },
  { id: 4, nameEn: 'Tahsas', nameAm: 'ታኅሣሥ' },
  { id: 5, nameEn: 'Tir', nameAm: 'ጥር' },
  { id: 6, nameEn: 'Yekatit', nameAm: 'የካቲት' },
  { id: 7, nameEn: 'Megabit', nameAm: 'መጋቢት' },
  { id: 8, nameEn: 'Miyazya', nameAm: 'ሚያዝያ' },
  { id: 9, nameEn: 'Ginbot', nameAm: 'ግንቦት' },
  { id: 10, nameEn: 'Sene', nameAm: 'ሰኔ' },
  { id: 11, nameEn: 'Hamle', nameAm: 'ሐምሌ' },
  { id: 12, nameEn: 'Nehase', nameAm: 'ነሐሴ' },
  { id: 13, nameEn: 'Pagume', nameAm: 'ጳጉሜን' },
];

export const GREGORIAN_MONTHS = [
  { id: 1, nameEn: 'January', nameAm: 'ጃንዋሪ' },
  { id: 2, nameEn: 'February', nameAm: 'ፌብሩዋሪ' },
  { id: 3, nameEn: 'March', nameAm: 'ማርች' },
  { id: 4, nameEn: 'April', nameAm: 'ኤፕሪል' },
  { id: 5, nameEn: 'May', nameAm: 'ሜይ' },
  { id: 6, nameEn: 'June', nameAm: 'ጁን' },
  { id: 7, nameEn: 'July', nameAm: 'ጁላይ' },
  { id: 8, nameEn: 'August', nameAm: 'ኦገስት' },
  { id: 9, nameEn: 'September', nameAm: 'ሴፕቴምበር' },
  { id: 10, nameEn: 'October', nameAm: 'ኦክቶበር' },
  { id: 11, nameEn: 'November', nameAm: 'ኖቬምበር' },
  { id: 12, nameEn: 'December', nameAm: 'ዲሴምበር' },
];
