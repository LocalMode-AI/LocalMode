'use client';

import { Eye, EyeOff, FileText, Lock, StickyNote, Trash2 } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** The kind of encrypted item a card represents. */
export type VaultItemKind = 'note' | 'document';

/** Props for {@link VaultItemCard}. */
export interface VaultItemCardProps {
  /** Item title (a non-sensitive envelope field — safe to render while locked). */
  title: string;
  /** Creation timestamp (preformatted display string, e.g. "2 days ago"). */
  createdAt?: string;
  /**
   * Whether the vault is locked. When `true`, the body is masked, no content
   * is rendered, and the reveal/delete actions are disabled.
   */
  locked: boolean;
  /**
   * Whether the decrypted content is currently revealed. Only meaningful while
   * unlocked. The consuming app toggles this via `onReveal`/`onHide`.
   * @default false
   */
  revealed?: boolean;
  /**
   * The decrypted plaintext content — supplied by the caller ONLY when revealed.
   * The card never receives ciphertext or key material; the app decrypts and
   * passes plaintext in when the user reveals.
   */
  content?: string;
  /** Item kind — drives the icon and the masked-body wording. @default 'note' */
  kind?: VaultItemKind;
  /** Fired when the user requests to reveal (decrypt-on-view) the content. */
  onReveal?: () => void;
  /** Fired when the user hides the revealed content. */
  onHide?: () => void;
  /** Fired when the user deletes the item. */
  onDelete?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A lock-state-aware card for a single encrypted vault item (a note or a text
 * document). When `locked`, the card renders a masked placeholder body with the
 * reveal/delete actions disabled — no decrypted content is present in the DOM.
 * When unlocked, it shows the title/timestamp with a reveal/hide toggle over the
 * caller-supplied decrypted `content` and a delete action, all via callbacks.
 *
 * The card never receives or renders ciphertext or key material: the consuming
 * app decrypts and passes plaintext in `content` only when `revealed` is true.
 * Works with any backend; recommended source: `useEncryptedVault` from
 * `@localmode/react` (`items`, `readItem`, `deleteItem`).
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <VaultItemCard
 *   title={item.title}
 *   kind="note"
 *   locked={status !== 'unlocked'}
 *   revealed={openId === item.id}
 *   content={openId === item.id ? plaintext : undefined}
 *   onReveal={() => reveal(item.id)}
 *   onHide={() => setOpenId(null)}
 *   onDelete={() => deleteItem(item.id)}
 * />
 * ```
 */
export function VaultItemCard({
  title,
  createdAt,
  locked,
  revealed = false,
  content,
  kind = 'note',
  onReveal,
  onHide,
  onDelete,
  className,
}: VaultItemCardProps) {
  const KindIcon = kind === 'document' ? FileText : StickyNote;
  // Locked ⇒ never render content; unlocked+revealed ⇒ render caller plaintext.
  const showContent = !locked && revealed;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <KindIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            {createdAt && (
              <p className="text-xs text-muted-foreground">{createdAt}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {locked ? (
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              aria-label="Locked"
            >
              <Lock className="size-3" aria-hidden="true" />
              Locked
            </span>
          ) : (
            <button
              type="button"
              onClick={showContent ? onHide : onReveal}
              aria-pressed={showContent}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              {showContent ? (
                <>
                  <EyeOff className="size-3.5" aria-hidden="true" /> Hide
                </>
              ) : (
                <>
                  <Eye className="size-3.5" aria-hidden="true" /> Reveal
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={locked}
            aria-label={`Delete ${title}`}
            className="inline-flex items-center rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body: masked while locked or hidden, plaintext only when revealed. */}
      {showContent ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
          {content}
        </pre>
      ) : (
        <div
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <Lock className="size-3.5" />
          <span className="select-none tracking-widest">••••••••••••••••</span>
          <span className="ml-auto">
            {locked ? 'Locked' : kind === 'document' ? 'Document hidden' : 'Note hidden'}
          </span>
        </div>
      )}
    </div>
  );
}
