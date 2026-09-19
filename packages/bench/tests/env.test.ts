/**
 * UA-parse fallback (used where UA Client Hints are absent: every WebKit
 * browser). The first iPhone submissions arrived as browser "unknown" because
 * Chrome for iOS advertises `CriOS/` with no `Version/` token, and iOS UAs
 * carry a real OS version that was being discarded as "unknown-frozen".
 */

import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '../src/env.js';

const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.7632.72 Mobile/15E148 Safari/604.1';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const FIREFOX_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15';
const EDGE_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/140.0 Mobile/15E148 Safari/604.1';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';

describe('parseUserAgent()', () => {
  it('identifies the WebKit-shell browsers on iOS by their own tokens', () => {
    expect(parseUserAgent(CHROME_IOS).browser).toMatchObject({ name: 'Chrome iOS', version: '145.0.7632.72' });
    expect(parseUserAgent(FIREFOX_IOS).browser).toMatchObject({ name: 'Firefox iOS', version: '141.0' });
    expect(parseUserAgent(EDGE_IOS).browser).toMatchObject({ name: 'Edge', version: '140.0' });
    expect(parseUserAgent(SAFARI_IOS).browser).toMatchObject({ name: 'Safari', version: '26.0' });
    expect(parseUserAgent(SAFARI_MAC).browser).toMatchObject({ name: 'Safari', version: '26.0' });
  });

  it('reports the iOS version, which the UA carries, and keeps frozen platforms honest', () => {
    expect(parseUserAgent(CHROME_IOS).os).toEqual({ platform: 'iOS', version: '26.0' });
    expect(parseUserAgent(SAFARI_IOS).os).toEqual({ platform: 'iOS', version: '26.0.1' });
    // Chromium's reduced UA pins Android to "10"; that is not a real version.
    expect(parseUserAgent(CHROME_ANDROID).os).toEqual({ platform: 'Android', version: 'unknown-frozen' });
    expect(parseUserAgent(SAFARI_MAC).os.platform).toBe('macOS');
  });
});
