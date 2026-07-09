/**
 * @file site-footer.tsx
 * @description Shared site footer for the apps/ui homepage and the /blocks gallery.
 * Styled with shadcn/ui CSS-variable tokens ONLY (no daisyUI, no raw hex) so it is
 * fully theme-aware in light and dark. Calm, mostly-monochrome aesthetic: muted
 * badges and links that gain foreground emphasis on hover/focus.
 */
import Link from 'next/link';
import {
  Shield,
  Zap,
  WifiOff,
  Lock,
  Coins,
  CloudOff,
  type LucideIcon,
} from 'lucide-react';

/** One trust badge in the footer badge row. */
interface FooterBadge {
  /** The lucide icon for this badge. */
  icon: LucideIcon;
  /** The short label shown next to the icon. */
  label: string;
}

/** The six trust badges. Calm and monochrome: no per-badge accent colors. */
const BADGES: FooterBadge[] = [
  { icon: Shield, label: 'Private' },
  { icon: Zap, label: 'Fast' },
  { icon: WifiOff, label: 'Offline' },
  { icon: Lock, label: 'Secure' },
  { icon: Coins, label: 'No Cost' },
  { icon: CloudOff, label: 'No APIs' },
];

/** One footer navigation link. */
interface FooterLink {
  /** The visible link label. */
  label: string;
  /** The link target (route or absolute URL). */
  href: string;
  /** Whether the link points off-site and should open in a new tab. */
  external?: boolean;
}

/** The footer link row: internal routes use next/link, external open in a new tab. */
const LINKS: FooterLink[] = [
  { label: 'GitHub', href: 'https://github.com/LocalMode-AI/LocalMode', external: true },
  { label: 'Docs', href: '/docs' },
  { label: 'Components', href: '/docs/components' },
  { label: 'Blocks', href: '/blocks' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Blog', href: 'https://localmode.dev/blog', external: true },
  { label: 'npm', href: 'https://www.npmjs.com/org/localmode', external: true },
  { label: 'Contact', href: 'mailto:info@localmode.ai' },
];

/**
 * The shared site footer: a trust-badge row over a brand + copyright line and a
 * navigation link row. Presentational and theme-aware (shadcn tokens only).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        {/* Trust badges: middot-separated, wrap on small screens. */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
          {BADGES.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-x-2">
              {i > 0 && (
                <span aria-hidden className="text-sm text-muted-foreground/50">
                  ·
                </span>
              )}
              <span className="group inline-flex cursor-default items-center gap-1.5">
                <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {label}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Bottom row: brand + copyright left, link row right. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p>
              <span className="font-bold text-foreground">
                LocalMode <span className="text-muted-foreground">/ui</span>
              </span>
              <span className="text-muted-foreground"> - local-first AI UI</span>
            </p>
            <p className="text-sm text-muted-foreground">
              © 2026 LocalMode · MIT License.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
          >
            {LINKS.map(({ label, href, external }) =>
              external ? (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  href={href}
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}
