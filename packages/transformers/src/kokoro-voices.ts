/**
 * Kokoro Voice Catalog
 *
 * Available voices for the Kokoro-82M TTS model with metadata
 * for UI display. Voice .bin files are fetched from the HuggingFace
 * model repo at inference time.
 *
 * Currently limited to English voices (29 voices, 2 dialects) because
 * the phonemizer npm package only ships English eSpeak-NG dictionary
 * data. The upstream Kokoro model supports 9 languages via Python's
 * misaki G2P, but no JS equivalent exists yet. Non-English voices
 * are preserved below (commented out) for future multilingual support.
 *
 * @packageDocumentation
 */

/** Metadata for a single Kokoro voice */
export interface KokoroVoice {
  /** Voice ID used in synthesis (e.g., 'af_heart') */
  readonly id: string;
  /** Display name (e.g., 'Heart') */
  readonly name: string;
  /** BCP-47 language code (e.g., 'en-US') */
  readonly language: string;
  /** Language display label */
  readonly languageLabel: string;
  /** Speaker gender */
  readonly gender: 'female' | 'male';
}

/**
 * Kokoro-82M voices with working phonemization (29 English voices).
 *
 * Naming convention: `[lang][gender]_[name]`
 * - Language prefix: a=American English, b=British English
 * - Gender: f=female, m=male
 */
export const KOKORO_VOICES: readonly KokoroVoice[] = [
  // American English Female
  { id: 'af', name: 'Default', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_alloy', name: 'Alloy', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_aoede', name: 'Aoede', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_bella', name: 'Bella', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_heart', name: 'Heart', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_jessica', name: 'Jessica', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_kore', name: 'Kore', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_nova', name: 'Nova', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_river', name: 'River', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', language: 'en-US', languageLabel: 'American English', gender: 'female' },
  { id: 'af_sky', name: 'Sky', language: 'en-US', languageLabel: 'American English', gender: 'female' },

  // American English Male
  { id: 'am_adam', name: 'Adam', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_echo', name: 'Echo', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_eric', name: 'Eric', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_liam', name: 'Liam', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_michael', name: 'Michael', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_onyx', name: 'Onyx', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_puck', name: 'Puck', language: 'en-US', languageLabel: 'American English', gender: 'male' },
  { id: 'am_santa', name: 'Santa', language: 'en-US', languageLabel: 'American English', gender: 'male' },

  // British English Female
  { id: 'bf_alice', name: 'Alice', language: 'en-GB', languageLabel: 'British English', gender: 'female' },
  { id: 'bf_emma', name: 'Emma', language: 'en-GB', languageLabel: 'British English', gender: 'female' },
  { id: 'bf_isabella', name: 'Isabella', language: 'en-GB', languageLabel: 'British English', gender: 'female' },
  { id: 'bf_lily', name: 'Lily', language: 'en-GB', languageLabel: 'British English', gender: 'female' },

  // British English Male
  { id: 'bm_daniel', name: 'Daniel', language: 'en-GB', languageLabel: 'British English', gender: 'male' },
  { id: 'bm_fable', name: 'Fable', language: 'en-GB', languageLabel: 'British English', gender: 'male' },
  { id: 'bm_george', name: 'George', language: 'en-GB', languageLabel: 'British English', gender: 'male' },
  { id: 'bm_lewis', name: 'Lewis', language: 'en-GB', languageLabel: 'British English', gender: 'male' },

  // ─── Non-English voices (upstream Kokoro supports these, but the
  //     phonemizer npm package only ships English eSpeak-NG dictionaries.
  //     Uncomment when a multilingual JS phonemizer becomes available.) ───
  //
  // Spanish (prefix: e)
  // { id: 'ef_dora', name: 'Dora', language: 'es', languageLabel: 'Spanish', gender: 'female' },
  // { id: 'em_alex', name: 'Alex', language: 'es', languageLabel: 'Spanish', gender: 'male' },
  // { id: 'em_santa', name: 'Santa', language: 'es', languageLabel: 'Spanish', gender: 'male' },
  //
  // French (prefix: f)
  // { id: 'ff_siwis', name: 'Siwis', language: 'fr', languageLabel: 'French', gender: 'female' },
  //
  // Hindi (prefix: h)
  // { id: 'hf_alpha', name: 'Alpha', language: 'hi', languageLabel: 'Hindi', gender: 'female' },
  // { id: 'hf_beta', name: 'Beta', language: 'hi', languageLabel: 'Hindi', gender: 'female' },
  // { id: 'hm_omega', name: 'Omega', language: 'hi', languageLabel: 'Hindi', gender: 'male' },
  // { id: 'hm_psi', name: 'Psi', language: 'hi', languageLabel: 'Hindi', gender: 'male' },
  //
  // Italian (prefix: i)
  // { id: 'if_sara', name: 'Sara', language: 'it', languageLabel: 'Italian', gender: 'female' },
  // { id: 'im_nicola', name: 'Nicola', language: 'it', languageLabel: 'Italian', gender: 'male' },
  //
  // Japanese (prefix: j)
  // { id: 'jf_alpha', name: 'Alpha', language: 'ja', languageLabel: 'Japanese', gender: 'female' },
  // { id: 'jf_gongitsune', name: 'Gongitsune', language: 'ja', languageLabel: 'Japanese', gender: 'female' },
  // { id: 'jf_nezumi', name: 'Nezumi', language: 'ja', languageLabel: 'Japanese', gender: 'female' },
  // { id: 'jf_tebukuro', name: 'Tebukuro', language: 'ja', languageLabel: 'Japanese', gender: 'female' },
  // { id: 'jm_kumo', name: 'Kumo', language: 'ja', languageLabel: 'Japanese', gender: 'male' },
  //
  // Portuguese (prefix: p)
  // { id: 'pf_dora', name: 'Dora', language: 'pt', languageLabel: 'Portuguese', gender: 'female' },
  // { id: 'pm_alex', name: 'Alex', language: 'pt', languageLabel: 'Portuguese', gender: 'male' },
  // { id: 'pm_santa', name: 'Santa', language: 'pt', languageLabel: 'Portuguese', gender: 'male' },
  //
  // Mandarin Chinese (prefix: z)
  // { id: 'zf_xiaobei', name: 'Xiaobei', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'female' },
  // { id: 'zf_xiaoni', name: 'Xiaoni', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'female' },
  // { id: 'zf_xiaoxiao', name: 'Xiaoxiao', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'female' },
  // { id: 'zf_xiaoyi', name: 'Xiaoyi', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'female' },
  // { id: 'zm_yunjian', name: 'Yunjian', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'male' },
  // { id: 'zm_yunxi', name: 'Yunxi', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'male' },
  // { id: 'zm_yunxia', name: 'Yunxia', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'male' },
  // { id: 'zm_yunyang', name: 'Yunyang', language: 'zh', languageLabel: 'Mandarin Chinese', gender: 'male' },
] as const;

/** Default voice used when none specified */
export const KOKORO_DEFAULT_VOICE = 'af_heart';

/**
 * Map voice ID prefix to eSpeak-NG language code for phonemization.
 * First char = language, second char = gender (not needed for phonemizer).
 */
export const KOKORO_LANG_MAP: Record<string, string> = {
  a: 'en-us',
  b: 'en-gb',
};
