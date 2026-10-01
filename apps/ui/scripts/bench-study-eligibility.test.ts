/**
 * The paid-study browser gate on /bench/run: Chrome or Edge on a computer,
 * or Chrome on Android, are eligible; WebKit (Safari, every iOS and iPadOS
 * browser), Gecko (Firefox) and unrecognised browsers are not. The decision
 * is pure and is tested here against real user-agent strings and the
 * `navigator.userAgentData.brands` lists those browsers expose.
 */
import { describe, expect, it } from 'vitest';
import { studyEligibility, type UserAgentBrand } from '../src/lib/bench/study-eligibility';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  // Recorded from Chrome for Testing 145 on this repository's Mac mini (2026-09-29).
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  headlessChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  // Recorded from Safari 26.3 on the same Mac (2026-09-29).
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15',
  safariIPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
  safariIPad:
    'Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
  chromeIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.8010.52 Mobile/15E148 Safari/604.1',
  firefoxIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/156.0 Mobile/15E148 Safari/605.1.15',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:156.0) Gecko/156.0 Firefox/156.0',
};

const BRANDS: Record<string, UserAgentBrand[]> = {
  chrome: [
    { brand: 'Not A(Brand', version: '8' },
    { brand: 'Chromium', version: '145' },
    { brand: 'Google Chrome', version: '145' },
  ],
  edge: [
    { brand: 'Microsoft Edge', version: '153' },
    { brand: 'Not.A/Brand', version: '99' },
    { brand: 'Chromium', version: '153' },
  ],
  // Brave lists only the engine and a GREASE brand.
  brave: [
    { brand: 'Chromium', version: '145' },
    { brand: 'Not A(Brand', version: '24' },
  ],
  samsung: [
    { brand: 'Samsung Internet', version: '28.0' },
    { brand: 'Chromium', version: '130' },
    { brand: 'Not?A_Brand', version: '24' },
  ],
  unknownOnly: [
    { brand: 'Not A(Brand', version: '8' },
    { brand: 'Some Browser', version: '1' },
  ],
};

const ELIGIBLE = { eligible: true };
const webkit = { eligible: false, reason: 'webkit' };
const gecko = { eligible: false, reason: 'gecko' };
const other = { eligible: false, reason: 'other' };

describe('studyEligibility: eligible Chromium browsers', () => {
  it('accepts desktop Chrome on Windows, macOS and Linux with its brands list', () => {
    for (const ua of [UA.chromeWindows, UA.chromeMac, UA.chromeLinux]) {
      expect(studyEligibility({ userAgent: ua, brands: BRANDS.chrome })).toEqual(ELIGIBLE);
    }
  });

  it('accepts Edge on a computer', () => {
    expect(studyEligibility({ userAgent: UA.edgeWindows, brands: BRANDS.edge })).toEqual(ELIGIBLE);
  });

  it('accepts Chrome on Android', () => {
    expect(studyEligibility({ userAgent: UA.chromeAndroid, brands: BRANDS.chrome })).toEqual(ELIGIBLE);
  });

  it('accepts Brave, whose brands list names only Chromium', () => {
    expect(studyEligibility({ userAgent: UA.chromeMac, brands: BRANDS.brave })).toEqual(ELIGIBLE);
  });

  it('accepts Samsung Internet, which lists the Chromium brand', () => {
    expect(studyEligibility({ userAgent: UA.samsungInternet, brands: BRANDS.samsung })).toEqual(ELIGIBLE);
  });

  it('falls back to the user-agent tokens when userAgentData is absent', () => {
    for (const ua of [UA.chromeWindows, UA.chromeMac, UA.chromeLinux, UA.edgeWindows, UA.chromeAndroid, UA.headlessChrome]) {
      expect(studyEligibility({ userAgent: ua })).toEqual(ELIGIBLE);
      expect(studyEligibility({ userAgent: ua, brands: null })).toEqual(ELIGIBLE);
      expect(studyEligibility({ userAgent: ua, brands: [] })).toEqual(ELIGIBLE);
    }
  });
});

describe('studyEligibility: ineligible browsers', () => {
  it('rejects Safari on macOS, iPhone and iPad as WebKit', () => {
    expect(studyEligibility({ userAgent: UA.safariMac })).toEqual(webkit);
    expect(studyEligibility({ userAgent: UA.safariIPhone })).toEqual(webkit);
    expect(studyEligibility({ userAgent: UA.safariIPad })).toEqual(webkit);
  });

  it('rejects Chrome for iOS (CriOS) and Firefox for iOS (FxiOS) as WebKit', () => {
    expect(studyEligibility({ userAgent: UA.chromeIOS })).toEqual(webkit);
    expect(studyEligibility({ userAgent: UA.firefoxIOS })).toEqual(webkit);
  });

  it('rejects a Safari user agent even when a Chromium brands list is present', () => {
    expect(studyEligibility({ userAgent: UA.safariMac, brands: BRANDS.chrome })).toEqual(webkit);
  });

  it('rejects an iOS device user agent that carries a Chrome token', () => {
    const iosWithChromeToken = UA.chromeIOS.replace('CriOS/', 'Chrome/');
    expect(studyEligibility({ userAgent: iosWithChromeToken, brands: BRANDS.chrome })).toEqual(webkit);
  });

  it('rejects Firefox on desktop and Android as Gecko', () => {
    expect(studyEligibility({ userAgent: UA.firefoxMac })).toEqual(gecko);
    expect(studyEligibility({ userAgent: UA.firefoxWindows })).toEqual(gecko);
    expect(studyEligibility({ userAgent: UA.firefoxAndroid })).toEqual(gecko);
  });

  it('rejects a brands list with no Chromium-family brand', () => {
    expect(studyEligibility({ userAgent: UA.chromeWindows, brands: BRANDS.unknownOnly })).toEqual(other);
  });

  it('rejects an unrecognised or empty user agent without brands', () => {
    expect(studyEligibility({ userAgent: '' })).toEqual(other);
    expect(studyEligibility({ userAgent: 'curl/8.7.1' })).toEqual(other);
    expect(studyEligibility({ userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)' })).toEqual(
      other,
    );
  });
});
