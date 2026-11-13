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
  isRtlLanguage,
  localizeError,
  resolveLanguage,
  setActiveLanguage,
  t,
  translate,
} from './index';
import { ar } from './translations/ar';
import { de } from './translations/de';
import { en } from './translations/en';
import { es } from './translations/es';
import { fa } from './translations/fa';
import { fr } from './translations/fr';
import { it as itTranslations } from './translations/it';
import { ml } from './translations/ml';
import { pt } from './translations/pt';
import { ru } from './translations/ru';
import { si } from './translations/si';
import { ta } from './translations/ta';
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
    expect(resolveLanguage('system', 'it-IT')).toBe('it');
    expect(resolveLanguage('system', 'fr-FR')).toBe('fr');
    expect(resolveLanguage('system', 'es-ES')).toBe('es');
    expect(resolveLanguage('system', 'pt-BR')).toBe('pt');
    expect(resolveLanguage('system', 'fa-IR')).toBe('fa');
    expect(resolveLanguage('system', 'de-DE')).toBe('de');
    expect(resolveLanguage('system', 'si-LK')).toBe('si');
    expect(resolveLanguage('system', 'ta-IN')).toBe('ta');
    expect(resolveLanguage('system', 'fr-CA')).toBe('fr');
    expect(resolveLanguage('system', null)).toBe('en');
  });

  it('lets an explicit choice override the device language', () => {
    expect(resolveLanguage('ar', 'en-US')).toBe('ar');
    expect(resolveLanguage('ru', 'ar-EG')).toBe('ru');
    expect(resolveLanguage('zh', 'en-US')).toBe('zh');
    expect(resolveLanguage('tr', 'ml-IN')).toBe('tr');
    expect(resolveLanguage('ml', 'zh-CN')).toBe('ml');
    expect(resolveLanguage('it', 'de-DE')).toBe('it');
    expect(resolveLanguage('fr', 'es-ES')).toBe('fr');
    expect(resolveLanguage('es', 'pt-BR')).toBe('es');
    expect(resolveLanguage('pt', 'fa-IR')).toBe('pt');
    expect(resolveLanguage('fa', 'de-DE')).toBe('fa');
    expect(resolveLanguage('si', 'ta-IN')).toBe('si');
    expect(resolveLanguage('ta', 'si-LK')).toBe('ta');
    expect(resolveLanguage('de', 'en-US')).toBe('de');
  });

  it('marks Persian as right-to-left', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('fa')).toBe(true);
    expect(isRtlLanguage('de')).toBe(false);
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
    const dictionaries = {
      ar,
      ml,
      ru,
      tr,
      zh,
      it: itTranslations,
      fr,
      es,
      pt,
      fa,
      de,
      si,
      ta,
    };
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

  it('formats Italian dates and durations', () => {
    setActiveLanguage('it');
    expect(formatDayLabel('2026-11-12')).toContain('novembre');
    expect(formatDurationCompact(3660)).toBe('1 h 1 min');
    expect(formatDurationWithSeconds(81)).toBe('1 min 21 s');
    expect(formatIntentionDuration(5400)).toBe('1 h 30 min');
  });

  it('formats French dates and durations', () => {
    setActiveLanguage('fr');
    expect(formatDayLabel('2026-11-12')).toContain('novembre');
    expect(formatDurationCompact(3660)).toBe('1 h 1 min');
    expect(formatDurationWithSeconds(81)).toBe('1 min 21 s');
    expect(formatIntentionDuration(5400)).toBe('1 h 30 min');
  });

  it('formats Spanish dates and durations', () => {
    setActiveLanguage('es');
    expect(formatDayLabel('2026-11-12')).toContain('noviembre');
    expect(formatDurationCompact(3660)).toBe('1 h 1 min');
    expect(formatDurationWithSeconds(81)).toBe('1 min 21 s');
    expect(formatIntentionDuration(5400)).toBe('1 h 30 min');
  });

  it('formats Portuguese dates and durations', () => {
    setActiveLanguage('pt');
    expect(formatDayLabel('2026-11-12')).toContain('novembro');
    expect(formatDurationCompact(3660)).toBe('1 h 1 min');
    expect(formatDurationWithSeconds(81)).toBe('1 min 21 s');
    expect(formatIntentionDuration(5400)).toBe('1 h 30 min');
  });

  it('formats Persian dates and durations in the Gregorian calendar', () => {
    setActiveLanguage('fa');
    expect(formatDayLabel('2026-11-12')).toContain('نوامبر');
    expect(formatDurationCompact(3660)).toBe('1 ساعت 1 دقیقه');
    expect(formatDurationWithSeconds(81)).toBe('1 دقیقه 21 ثانیه');
    expect(formatIntentionDuration(5400)).toBe('1 ساعت 30 دقیقه');
  });

  it('formats Sinhala dates and durations', () => {
    setActiveLanguage('si');
    expect(formatDayLabel('2026-11-12')).toContain('12');
    expect(formatDurationCompact(3660)).toBe('1 පැය 1 මිනි');
    expect(formatDurationWithSeconds(81)).toBe('1 මිනි 21 තත්');
    expect(formatIntentionDuration(5400)).toBe('1 පැය 30 මිනි');
  });

  it('formats Tamil dates and durations', () => {
    setActiveLanguage('ta');
    expect(formatDayLabel('2026-11-12')).toContain('நவம்பர்');
    expect(formatDurationCompact(3660)).toBe('1 மணி 1 நிமி');
    expect(formatDurationWithSeconds(81)).toBe('1 நிமி 21 வினா');
    expect(formatIntentionDuration(5400)).toBe('1 மணி 30 நிமி');
  });

  it('formats German dates and durations', () => {
    setActiveLanguage('de');
    expect(formatDayLabel('2026-11-12')).toContain('November');
    expect(formatDurationCompact(3660)).toBe('1 Std. 1 Min.');
    expect(formatDurationWithSeconds(81)).toBe('1 Min. 21 Sek.');
    expect(formatIntentionDuration(5400)).toBe('1 Std. 30 Min.');
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
