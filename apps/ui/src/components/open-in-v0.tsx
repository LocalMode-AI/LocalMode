/**
 * @file open-in-v0.tsx
 * @description "Open in v0" handoff button — cherry-picked from registry-starter,
 * restyled to match the Fumadocs/shadcn theme. Links to v0 with the item's
 * `/r/<name>.json` registry endpoint so the component can be remixed in v0.
 * Renders only for components whose v0 preview actually works (see
 * {@link isV0Eligible}) — v0 mounts the component propless and cannot resolve
 * shadcn-primitive deps, so the button is hidden where it would land on a broken
 * preview.
 */
import { registryItemUrl, openInV0Url } from '@/lib/registry';
import { isV0Eligible } from '@/lib/v0-eligibility';

/** Props for {@link OpenInV0}. */
interface OpenInV0Props {
  /** Registry item name (under the ui/ scheme), e.g. `ui/local-first/device-badge`. */
  name: string;
}

/** A button that opens the given registry item in v0, when its preview works. */
export function OpenInV0({ name }: OpenInV0Props) {
  if (!isV0Eligible(name)) return null;

  return (
    <a
      href={openInV0Url(name)}
      target="_blank"
      rel="noreferrer noopener"
      data-registry-url={registryItemUrl(name)}
      className="not-prose inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground no-underline transition-colors hover:bg-muted"
    >
      Open in
      <svg
        viewBox="0 0 40 20"
        aria-hidden="true"
        className="h-3.5 w-auto fill-current"
      >
        <path d="M23.3919 0H32.9188C36.7819 0 39.9136 3.13165 39.9136 6.99475V16.0805H36.0006V6.99475C36.0006 6.90167 35.9969 6.80925 35.9898 6.71766L26.4628 16.079C26.4949 16.08 26.5272 16.0805 26.5595 16.0805H36.0006V19.7762H26.5595C22.6964 19.7762 19.4788 16.6139 19.4788 12.7508V3.68923H23.3919V12.7508C23.3919 12.9253 23.4054 13.0977 23.4316 13.2668L33.1682 3.6995C33.0861 3.6927 33.003 3.68923 32.9188 3.68923H23.3919V0Z" />
        <path d="M13.7688 19.0956L0 3.68759H5.53933L13.6231 12.7337V3.68759H17.7535V17.5746C17.7535 19.6705 15.1654 20.6584 13.7688 19.0956Z" />
      </svg>
    </a>
  );
}
