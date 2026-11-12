import {
  formatDayLabel,
  formatWeekRangeLabel,
} from '../domain/shared/dateUtils';
import { formatIntentionDuration } from '../domain/intentions/intentionsDomain';
import {
  formatDurationCompact,
  formatDurationWithSeconds,
} from '../domain/timer/timerEngine';
import {
  localizeError,
  resolveLanguage,
  setActiveLanguage,
  t,
  translate,
} from './index';
import { ar } from './translations/ar';
import { en } from './translations/en';
import { ml } from './translations/ml';
import { ru } from './translations/ru';
import { tr } from './translations/tr';
import { zh } from './translations/zh';
import type { TranslationEntry, TranslationKey } from './types';

afterEach(() => {
  setActiveLanguage('en');
});

describe('resolveLanguage', () => {
  it('follows the device language when set to system', () => {
    expect(resolveLanguage('system', 'ru-RU')).toBe('ru');
    expect(resolveLanguage('system', 'ar-EG')).toBe('ar');
    expect(resolveLanguage('system', 'zh-Hans-CN')).toBe('zh');
    expect(resolveLanguage('system', 'tr-TR')).toBe('tr');
    expect(resolveLanguage('system', 'ml-IN')).toBe('ml');
    expect(resolveLanguage('system', 'fr-FR')).toBe('en');
    expect(resolveLanguage('system', null)).toBe('en');
  });

  it('lets an explicit choice override the device language', () => {
    expect(resolveLanguage('ar', 'en-US')).toBe('ar');
    expect(resolveLanguage('ru', 'ar-EG')).toBe('ru');
    expect(resolveLanguage('zh', 'en-US')).toBe('zh');
    expect(resolveLanguage('tr', 'ml-IN')).toBe('tr');
    expect(resolveLanguage('ml', 'zh-CN')).toBe('ml');
  });
});

describe('translate', () => {
  function placeholders(entry: TranslationEntry): string[] {
    const text =
      typeof entry === 'string' ? entry : Object.values(entry).join(' ');
    return [
      ...new Set(
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '')
      ),
    ].sort();
  }

  it('keeps interpolation placeholders in every language', () => {
    const dictionaries = { ar, ml, ru, tr, zh };
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const key of Object.keys(en) as TranslationKey[]) {
        const expected = placeholders(en[key]);
        const actual = placeholders(dictionary[key]);
        if (actual.join(',') !== expected.join(',')) {
          throw new Error(
            `${language} ${key}: expected ${expected.join(', ') || 'none'}, got ${actual.join(', ') || 'none'}`
          );
        }
      }
    }
  });

  it('interpolates parameters', () => {
    expect(
      translate('en', 'clock.remaining', { duration: '38m' })
    ).toBe('38m remaining');
    expect(
      translate('ru', 'clock.remaining', { duration: '38 м' })
    ).toBe('осталось 38 м');
    expect(
      translate('zh', 'clock.remaining', { duration: '38分' })
    ).toBe('还剩 38分');
    expect(
      translate('tr', 'clock.remaining', { duration: '38 dk' })
    ).toBe('38 dk kaldı');
    expect(
      translate('ml', 'clock.remaining', { duration: '38 മിനി.' })
    ).toBe('38 മിനി. ശേഷിക്കുന്നു');
  });

  it('uses Russian plural forms', () => {
    expect(translate('ru', 'loopStart.minutes', { count: 1 })).toBe(
      '1 минуту'
    );
    expect(translate('ru', 'loopStart.minutes', { count: 2 })).toBe(
      '2 минуты'
    );
    expect(translate('ru', 'loopStart.minutes', { count: 5 })).toBe(
      '5 минут'
    );
  });

  it('uses Arabic plural forms', () => {
    expect(translate('ar', 'loopStart.minutes', { count: 2 })).toBe(
      '2 دقيقتان'
    );
    expect(translate('ar', 'loopStart.minutes', { count: 3 })).toBe(
      '3 دقائق'
    );
    expect(translate('ar', 'loopStart.minutes', { count: 11 })).toBe(
      '11 دقيقة'
    );
  });
});

describe('localized dates and durations', () => {
  it('formats Russian dates and durations', () => {
    setActiveLanguage('ru');
    expect(formatDayLabel('2026-11-12')).toContain('ноября');
    expect(formatWeekRangeLabel('2026-11-09', '2026-11-15')).toContain(
      'нояб'
    );
    expect(formatDurationCompact(3660)).toBe('1 ч 1 м');
    expect(formatDurationWithSeconds(81)).toBe('1 м 21 с');
    expect(formatIntentionDuration(5400)).toBe('1 ч 30 мин');
  });

  it('formats Arabic dates and durations', () => {
    setActiveLanguage('ar');
    expect(formatDayLabel('2026-11-12')).toContain('نوفمبر');
    expect(formatDurationCompact(3660)).toBe('1 س 1 د');
    expect(formatIntentionDuration(5400)).toBe('1 س 30 د');
  });

  it('formats Chinese dates and durations', () => {
    setActiveLanguage('zh');
    expect(formatDayLabel('2026-11-12')).toContain('2026年11月12日');
    expect(formatDurationCompact(3660)).toBe('1小时 1分');
    expect(formatDurationWithSeconds(81)).toBe('1分 21秒');
    expect(formatIntentionDuration(5400)).toBe('1小时 30分钟');
  });

  it('formats Turkish dates and durations', () => {
    setActiveLanguage('tr');
    expect(formatDayLabel('2026-11-12')).toContain('Kasım');
    expect(formatDurationCompact(3660)).toBe('1 sa 1 dk');
    expect(formatDurationWithSeconds(81)).toBe('1 dk 21 sn');
    expect(formatIntentionDuration(5400)).toBe('1 sa 30 dk');
  });

  it('formats Malayalam dates and durations', () => {
    setActiveLanguage('ml');
    expect(formatDayLabel('2026-11-12')).toContain('നവംബർ');
    expect(formatDurationCompact(3660)).toBe('1 മണി. 1 മിനി.');
    expect(formatDurationWithSeconds(81)).toBe('1 മിനി. 21 സെക.');
    expect(formatIntentionDuration(5400)).toBe('1 മണി. 30 മിനി.');
  });
});

describe('localizeError', () => {
  it('maps known service errors', () => {
    setActiveLanguage('ru');
    expect(localizeError(new Error('A task needs a title.'))).toBe(
      'У задачи должно быть название.'
    );
    expect(localizeError(new Error('Loop abc was not found.'))).toBe(
      'Loop abc was not found.'
    );
  });

  it('uses the fallback for unknown values', () => {
    expect(localizeError(null)).toBe(t('common.pleaseTryAgain'));
  });
});
