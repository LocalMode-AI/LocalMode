/**
 * @file speculation-rules.tsx
 * @description Speculation Rules API (seo.md §11.3) for near-instant navigation.
 * IMPORTANT: only `/docs/*` is prerendered (static content, safe to execute
 * ahead of time). Block pages are deliberately NOT prerendered — prerendering a
 * /blocks page would run its effects and could spin up WebGPU/WASM/model logic
 * before the user opts in. Everything (including /blocks) gets conservative
 * prefetch only, which fetches markup without executing it.
 */
export function SpeculationRules() {
  const rules = {
    prerender: [{ where: { href_matches: '/docs/*' }, eagerness: 'moderate' }],
    prefetch: [
      {
        where: {
          and: [{ href_matches: '/*' }, { not: { href_matches: ['/r/*', '/api/*'] } }],
        },
        eagerness: 'conservative',
      },
    ],
  };
  return (
    <script
      type="speculationrules"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}
