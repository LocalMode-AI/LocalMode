/**
 * The paid-study browser gate on /bench/run: Chrome or Edge on a computer
 * (Windows, macOS, Linux, ChromeOS) is eligible; WebKit (Safari, every iOS and
 * iPadOS browser), phones and tablets of any browser, Gecko (Firefox) and
 * unrecognised browsers are not. The decision
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
  // Chrome on a Chromebook: the `CrOS` token is what the bench records as the platform "Chrome OS".
  chromeOS:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  headlessChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  // Chrome's "desktop site" mode on Android in the form that drops `Mobile` and keeps `Android`.
  chromeAndroidDesktopSite:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  // Chrome on an Android tablet: no `Mobile` token.
  chromeAndroidTablet:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
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
  firefoxAndroidTablet: 'Mozilla/5.0 (Android 14; Tablet; rv:156.0) Gecko/156.0 Firefox/156.0',
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
const mobile = { eligible: false, reason: 'mobile' };
const gecko = { eligible: false, reason: 'gecko' };
const other = { eligible: false, reason: 'other' };

describe('studyEligibility: eligible Chromium browsers', () => {
  it('accepts desktop Chrome on Windows, macOS and Linux with its brands list', () => {
    for (const ua of [UA.chromeWindows, UA.chromeMac, UA.chromeLinux]) {
      expect(studyEligibility({ userAgent: ua, brands: BRANDS.chrome })).toEqual(ELIGIBLE);
    }
  });

  it('accepts Chrome on ChromeOS, with its brands list (userAgentData.platform "Chrome OS") and without userAgentData', () => {
    const chromeOSBrands: UserAgentBrand[] = [
      { brand: 'Chromium', version: '152' },
      { brand: 'Google Chrome', version: '152' },
      { brand: 'Not_A Brand', version: '99' },
    ];
    expect(studyEligibility({ userAgent: UA.chromeOS, brands: chromeOSBrands })).toEqual(ELIGIBLE);
    expect(studyEligibility({ userAgent: UA.chromeOS })).toEqual(ELIGIBLE);
    expect(studyEligibility({ userAgent: UA.chromeOS, brands: null })).toEqual(ELIGIBLE);
  });

  it('accepts Edge on a computer', () => {
    expect(studyEligibility({ userAgent: UA.edgeWindows, brands: BRANDS.edge })).toEqual(ELIGIBLE);
  });

  it('accepts Brave, whose brands list names only Chromium', () => {
    expect(studyEligibility({ userAgent: UA.chromeMac, brands: BRANDS.brave })).toEqual(ELIGIBLE);
  });

  it('accepts desktop Chrome whose userAgentData reports mobile false and a desktop platform', () => {
    expect(
      studyEligibility({ userAgent: UA.chromeWindows, brands: BRANDS.chrome, mobile: false, platform: 'Windows' }),
    ).toEqual(ELIGIBLE);
    expect(studyEligibility({ userAgent: UA.chromeMac, brands: BRANDS.chrome, mobile: false, platform: 'macOS' })).toEqual(
      ELIGIBLE,
    );
    expect(studyEligibility({ userAgent: UA.chromeLinux, brands: BRANDS.chrome, mobile: false, platform: 'Linux' })).toEqual(
      ELIGIBLE,
    );
    expect(
      studyEligibility({ userAgent: UA.chromeOS, brands: BRANDS.chrome, mobile: false, platform: 'Chrome OS' }),
    ).toEqual(ELIGIBLE);
  });

  it('falls back to the user-agent tokens when userAgentData is absent', () => {
    for (const ua of [UA.chromeWindows, UA.chromeMac, UA.chromeLinux, UA.edgeWindows, UA.headlessChrome]) {
      expect(studyEligibility({ userAgent: ua })).toEqual(ELIGIBLE);
      expect(studyEligibility({ userAgent: ua, brands: null })).toEqual(ELIGIBLE);
      expect(studyEligibility({ userAgent: ua, brands: [] })).toEqual(ELIGIBLE);
    }
  });
});

describe('studyEligibility: phones and tablets', () => {
  it('rejects Chrome on an Android phone, with its brands list and mobile bit, as mobile', () => {
    expect(
      studyEligibility({ userAgent: UA.chromeAndroid, brands: BRANDS.chrome, mobile: true, platform: 'Android' }),
    ).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.chromeAndroid, brands: BRANDS.chrome })).toEqual(mobile);
  });

  it('rejects Chrome on an Android phone without userAgentData as mobile', () => {
    expect(studyEligibility({ userAgent: UA.chromeAndroid })).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.chromeAndroid, brands: null })).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.chromeAndroid, brands: [] })).toEqual(mobile);
  });

  it('rejects Chrome on Android in desktop-site mode (no Mobile token, still Android) as mobile', () => {
    expect(UA.chromeAndroidDesktopSite).not.toMatch(/\bMobile\b/);
    expect(
      studyEligibility({ userAgent: UA.chromeAndroidDesktopSite, brands: BRANDS.chrome, mobile: false, platform: 'Android' }),
    ).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.chromeAndroidDesktopSite })).toEqual(mobile);
  });

  it('rejects desktop-site mode whose user agent is rewritten to Linux when userAgentData.platform is Android', () => {
    expect(
      studyEligibility({ userAgent: UA.chromeLinux, brands: BRANDS.chrome, mobile: false, platform: 'Android' }),
    ).toEqual(mobile);
  });

  it('rejects Chrome on an Android tablet that reports mobile false, by its Android token', () => {
    expect(
      studyEligibility({ userAgent: UA.chromeAndroidTablet, brands: BRANDS.chrome, mobile: false, platform: 'Android' }),
    ).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.chromeAndroidTablet, brands: BRANDS.chrome, mobile: false })).toEqual(mobile);
  });

  it('rejects a Chromium user agent carrying a Tablet or Mobile token, and a true mobile bit alone', () => {
    const tabletToken = UA.chromeLinux.replace('X11; Linux x86_64', 'X11; Linux x86_64; Tablet');
    expect(studyEligibility({ userAgent: tabletToken, brands: BRANDS.chrome })).toEqual(mobile);
    const mobileToken = UA.chromeLinux.replace('Safari/537.36', 'Mobile Safari/537.36');
    expect(studyEligibility({ userAgent: mobileToken })).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.chromeWindows, brands: BRANDS.chrome, mobile: true })).toEqual(mobile);
  });

  it('rejects Samsung Internet on Android, which lists the Chromium brand, as mobile', () => {
    expect(studyEligibility({ userAgent: UA.samsungInternet, brands: BRANDS.samsung, mobile: true })).toEqual(mobile);
  });

  it('rejects Firefox on an Android phone and tablet as mobile (the mobile rule precedes the Gecko rule)', () => {
    expect(studyEligibility({ userAgent: UA.firefoxAndroid })).toEqual(mobile);
    expect(studyEligibility({ userAgent: UA.firefoxAndroidTablet })).toEqual(mobile);
  });

  it('keeps iPhone and iPad browsers on the WebKit rule, which precedes the mobile rule', () => {
    for (const ua of [UA.safariIPhone, UA.safariIPad, UA.chromeIOS, UA.firefoxIOS]) {
      expect(studyEligibility({ userAgent: ua, mobile: true })).toEqual(webkit);
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

  it('rejects Firefox on a computer as Gecko', () => {
    expect(studyEligibility({ userAgent: UA.firefoxMac })).toEqual(gecko);
    expect(studyEligibility({ userAgent: UA.firefoxWindows })).toEqual(gecko);
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
