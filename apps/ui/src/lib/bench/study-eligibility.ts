/**
 * Browser eligibility for a paid-study run of /bench/run. The study pays only
 * for runs from Chromium: Chrome or Edge on a computer (Windows, macOS,
 * Linux, ChromeOS) or Chrome on Android. The completion code is never shown
 * to any other browser, and the Run button is replaced by a notice there, so
 * a study link opened in an ineligible browser downloads nothing.
 *
 * `studyEligibility` is pure and takes the browser's identity as arguments;
 * `readStudyEligibility` reads it from the real `navigator`.
 */
import { isWebKitUserAgent } from './wake-lock';

/** Why a browser is not eligible: its engine is WebKit, Gecko, or unrecognised. */
export type StudyIneligibleReason = 'webkit' | 'gecko' | 'other';

export type StudyEligibility = { eligible: true } | { eligible: false; reason: StudyIneligibleReason };

/** One entry of `navigator.userAgentData.brands`. */
export interface UserAgentBrand {
  brand: string;
  version: string;
}

/** The browser identity the decision is made from. */
export interface StudyBrowserIdentity {
  /** `navigator.userAgent`. */
  userAgent: string;
  /** `navigator.userAgentData?.brands`; absent outside Chromium and in insecure contexts. */
  brands?: readonly UserAgentBrand[] | null;
}

/** Brands that identify a Chromium engine (Brave, Opera and Samsung Internet list "Chromium" too). */
const CHROMIUM_BRANDS = new Set(['Chromium', 'Google Chrome', 'Microsoft Edge']);

/** iPhone, iPad and iPod: every browser there is WebKit, whatever its name. */
const IOS_DEVICE = /\b(?:iPhone|iPad|iPod)\b/;

/** Firefox and other Gecko browsers; Chromium says "like Gecko", never `Gecko/<date>`. */
const GECKO = /(?:Firefox|Gecko)\//;

/** User-agent tokens of Chromium browsers (Chrome, Chromium, Edge, and their derivatives). */
const CHROMIUM_TOKEN = /(?:Chrome|Chromium|HeadlessChrome|Edg)\//;

/**
 * Decide whether a browser may take part in the paid study. Rules, in order:
 *
 * 1. WebKit is ineligible (`webkit`): an `AppleWebKit/` user agent without a
 *    `Chrome/`, `Chromium/` or `HeadlessChrome/` token (Safari on macOS,
 *    and every iOS and iPadOS browser, including Chrome `CriOS` and Firefox
 *    `FxiOS`), or any user agent naming an iPhone, iPad or iPod. iPadOS
 *    Safari that presents itself as macOS is WebKit and falls under the same
 *    rule. The user-agent string is checked first, so a Chromium page whose
 *    user agent claims Safari is treated as Safari.
 * 2. Gecko is ineligible (`gecko`): a `Firefox/` or `Gecko/` token without a
 *    Chromium token (Firefox on desktop and Android).
 * 3. When `userAgentData.brands` is present, the browser is eligible if one
 *    brand is "Chromium", "Google Chrome" or "Microsoft Edge" (so Brave,
 *    Opera and Samsung Internet, which list "Chromium", are eligible), and
 *    `other` otherwise.
 * 4. Without brands (older Chromium, insecure contexts), a `Chrome/`,
 *    `Chromium/`, `HeadlessChrome/` or `Edg/` token in the user agent makes
 *    the browser eligible.
 * 5. Anything else is ineligible (`other`).
 *
 * @param identity - The user-agent string and, when available, the brands list.
 * @returns `{ eligible: true }`, or `{ eligible: false, reason }`.
 * @example
 * studyEligibility({ userAgent: navigator.userAgent, brands: navigator.userAgentData?.brands });
 */
export function studyEligibility(identity: StudyBrowserIdentity): StudyEligibility {
  const ua = identity.userAgent ?? '';
  if (isWebKitUserAgent(ua) || IOS_DEVICE.test(ua)) return { eligible: false, reason: 'webkit' };
  if (GECKO.test(ua) && !CHROMIUM_TOKEN.test(ua)) return { eligible: false, reason: 'gecko' };
  const brands = identity.brands;
  if (brands && brands.length > 0) {
    return brands.some((b) => CHROMIUM_BRANDS.has(b.brand)) ? { eligible: true } : { eligible: false, reason: 'other' };
  }
  if (CHROMIUM_TOKEN.test(ua)) return { eligible: true };
  return { eligible: false, reason: 'other' };
}

/**
 * `studyEligibility` for the browser running this page. Outside a browser
 * (server rendering) there is nothing to read, and the result is `other`.
 *
 * @returns The eligibility of the current browser.
 */
export function readStudyEligibility(): StudyEligibility {
  if (typeof navigator === 'undefined') return { eligible: false, reason: 'other' };
  const data = (navigator as Navigator & { userAgentData?: { brands?: readonly UserAgentBrand[] } }).userAgentData;
  return studyEligibility({ userAgent: navigator.userAgent, brands: data?.brands ?? null });
}
