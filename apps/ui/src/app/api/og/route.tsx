/**
 * @file route.tsx
 * @description Dynamic 1200×630 social-share image (seo.md §2.6) rendered with
 * next/og. Every page points `openGraph.images` / `twitter.images` at
 * `/api/og?title=…&desc=…&eyebrow=…` via `@/lib/og`. Uses real Inter (the site
 * font) in three weights for a crisp, on-brand card; falls back to the built-in
 * font if the font CDN is unreachable so the image always renders.
 */
import { ImageResponse } from 'next/og';

export const contentType = 'image/png';

const clamp = (s: string | null, fallback: string, max: number) =>
  (s ?? fallback).slice(0, max);

// Inter (latin subset, woff — Satori-compatible) from the @fontsource CDN, loaded
// once per server process. Falls back to next/og's default font on any failure.
const FONT_URLS: Record<number, string> = {
  400: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-400-normal.woff',
  600: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-600-normal.woff',
  800: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-800-normal.woff',
};

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: 'normal' };
let fontsPromise: Promise<Font[] | undefined> | null = null;

function loadFonts(): Promise<Font[] | undefined> {
  fontsPromise ??= (async () => {
    try {
      return await Promise.all(
        (Object.entries(FONT_URLS) as [string, string][]).map(async ([weight, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`font ${weight} ${res.status}`);
          return {
            name: 'Inter',
            data: await res.arrayBuffer(),
            weight: Number(weight) as 400 | 600 | 800,
            style: 'normal' as const,
          };
        }),
      );
    } catch {
      return undefined; // graceful fallback → next/og default font
    }
  })();
  return fontsPromise;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = clamp(searchParams.get('title'), 'LocalMode UI', 110);
  const description = clamp(searchParams.get('desc'), '', 180);
  const eyebrow = clamp(searchParams.get('eyebrow'), 'localmode.ai', 48);
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0a0a0a',
          backgroundImage:
            'radial-gradient(1200px 600px at 100% 0%, rgba(59,130,246,0.16), transparent 60%)',
          padding: '72px',
          color: '#fafafa',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '72px',
              height: '72px',
              borderRadius: '18px',
              background: '#141414',
              border: '2px solid rgba(255,255,255,0.12)',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 2 20 20" />
              <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
              <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: '34px', fontWeight: 800, letterSpacing: '-0.5px' }}>
            <span>LocalMode</span>
            <span style={{ color: '#71717a', fontWeight: 600 }}>&nbsp;/ui</span>
          </div>
        </div>

        {/* Title block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', fontSize: '24px', color: '#60a5fa', fontWeight: 600 }}>
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 40 ? '64px' : '78px',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-2px',
            }}
          >
            {title}
          </div>
          {description ? (
            <div style={{ display: 'flex', fontSize: '30px', color: '#a1a1aa', lineHeight: 1.3, maxWidth: '900px' }}>
              {description}
            </div>
          ) : null}
        </div>

        {/* Footer strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '24px', color: '#a1a1aa' }}>
          <span style={{ color: '#fafafa', fontWeight: 600 }}>On-device AI</span>
          <span>·</span>
          <span>Nothing leaves the browser</span>
          <span>·</span>
          <span>MIT</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fonts ? { fonts } : {}),
      // Cache at the browser + CDN so scrapers/edges don't regenerate every fetch.
      headers: { 'cache-control': 'public, max-age=86400, s-maxage=604800' },
    },
  );
}
