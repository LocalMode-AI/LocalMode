/**
 * Language Code Constants
 *
 * ISO 639-1 language code to human-readable name mapping. Covers the
 * languages supported by browser-side language detection models.
 *
 * @packageDocumentation
 */

/**
 * ISO 639-1 language code to English language name.
 *
 * Useful for rendering language detection results in a UI.
 *
 * @example
 * ```ts
 * import { SUPPORTED_LANGUAGES } from '@localmode/core';
 *
 * SUPPORTED_LANGUAGES['fr']; // 'French'
 * ```
 */
export const SUPPORTED_LANGUAGES: Readonly<Record<string, string>> = {
  af: 'Afrikaans',
  am: 'Amharic',
  ar: 'Arabic',
  az: 'Azerbaijani',
  be: 'Belarusian',
  bg: 'Bulgarian',
  bn: 'Bengali',
  bs: 'Bosnian',
  ca: 'Catalan',
  ceb: 'Cebuano',
  co: 'Corsican',
  cs: 'Czech',
  cy: 'Welsh',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  eo: 'Esperanto',
  es: 'Spanish',
  et: 'Estonian',
  eu: 'Basque',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  fy: 'Frisian',
  ga: 'Irish',
  gd: 'Scots Gaelic',
  gl: 'Galician',
  gu: 'Gujarati',
  ha: 'Hausa',
  haw: 'Hawaiian',
  he: 'Hebrew',
  hi: 'Hindi',
  hmn: 'Hmong',
  hr: 'Croatian',
  ht: 'Haitian Creole',
  hu: 'Hungarian',
  hy: 'Armenian',
  id: 'Indonesian',
  ig: 'Igbo',
  is: 'Icelandic',
  it: 'Italian',
  ja: 'Japanese',
  jv: 'Javanese',
  ka: 'Georgian',
  kk: 'Kazakh',
  km: 'Khmer',
  kn: 'Kannada',
  ko: 'Korean',
  ku: 'Kurdish',
  ky: 'Kyrgyz',
  la: 'Latin',
  lb: 'Luxembourgish',
  lo: 'Lao',
  lt: 'Lithuanian',
  lv: 'Latvian',
  mg: 'Malagasy',
  mi: 'Maori',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mn: 'Mongolian',
  mr: 'Marathi',
  ms: 'Malay',
  mt: 'Maltese',
  my: 'Burmese',
  ne: 'Nepali',
  nl: 'Dutch',
  no: 'Norwegian',
  ny: 'Nyanja',
  pa: 'Punjabi',
  pl: 'Polish',
  ps: 'Pashto',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sd: 'Sindhi',
  si: 'Sinhala',
  sk: 'Slovak',
  sl: 'Slovenian',
  sm: 'Samoan',
  sn: 'Shona',
  so: 'Somali',
  sq: 'Albanian',
  sr: 'Serbian',
  st: 'Sesotho',
  su: 'Sundanese',
  sv: 'Swedish',
  sw: 'Swahili',
  ta: 'Tamil',
  te: 'Telugu',
  tg: 'Tajik',
  th: 'Thai',
  tl: 'Tagalog',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  vi: 'Vietnamese',
  xh: 'Xhosa',
  yi: 'Yiddish',
  yo: 'Yoruba',
  zh: 'Chinese',
  zu: 'Zulu',
};

/**
 * Get the human-readable name for an ISO 639-1 language code.
 *
 * Accepts BCP 47 tags with script or region subtags (`'zh-Hans'`, `'sr-Latn'`,
 * `'pt-BR'`) and resolves them to the base language's name. The primary subtag is
 * matched case-insensitively.
 *
 * @param code - ISO 639-1 language code or BCP 47 tag (e.g., 'fr', 'zh-Hans')
 * @returns The language name, or the code itself if not recognized
 *
 * @example
 * ```ts
 * getLanguageName('zh-Hans'); // 'Chinese'
 * getLanguageName('xx');      // 'xx'
 * ```
 */
export function getLanguageName(code: string): string {
  if (Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, code)) {
    return SUPPORTED_LANGUAGES[code];
  }
  const primary = code.split('-')[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, primary)
    ? SUPPORTED_LANGUAGES[primary]
    : code;
}
