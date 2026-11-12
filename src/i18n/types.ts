export type TranslationKey = keyof typeof import('./translations/en').en;

export type PluralForms = {
  other: string;
} & Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>>;

export type TranslationEntry = string | PluralForms;

export type TranslationParams = Record<string, string | number>;
