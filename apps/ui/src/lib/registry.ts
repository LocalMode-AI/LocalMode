/**
 * @file registry.ts
 * @description Shared registry constants for the @localmode/ui shadcn registry.
 *
 * The site is BOTH the registry endpoint and the docs site. Registry item JSON
 * is served from `/r/<name>.json` (e.g. `/r/ui/local-first/device-badge.json`). The consumer
 * configures the single-token `@localmode` namespace in their `components.json`:
 *
 *   { "registries": { "@localmode": "https://localmode.ai/r/{name}.json" } }
 *
 * and installs with `npx shadcn@latest add @localmode/ui/<name>`. The `ui/`
 * separation lives in the item name so registry items stay distinct from the
 * `@localmode/*` npm packages (core/react/providers).
 */

/** Public origin where the registry is served. Overridable for previews. */
export const REGISTRY_ORIGIN =
  process.env.NEXT_PUBLIC_REGISTRY_ORIGIN ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://localmode.ai';

/** The single-token shadcn namespace consumers configure. */
export const NAMESPACE = '@localmode';

/** Build the public `/r/<name>.json` URL for a registry item name. */
export function registryItemUrl(name: string) {
  return `${REGISTRY_ORIGIN}/r/${name}.json`;
}

/** The `npx shadcn add` command string for an item (under the ui/ scheme). */
export function installCommand(name: string) {
  return `npx shadcn@latest add ${NAMESPACE}/${name}`;
}

/** Build the "Open in v0" handoff URL for a registry item. */
export function openInV0Url(name: string) {
  const url = registryItemUrl(name);
  return `https://v0.dev/chat/api/open?url=${encodeURIComponent(url)}`;
}
