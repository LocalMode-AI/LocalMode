'use client';

import { type ComponentType } from 'react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/registry/localmode/ui/command';

/** A single slash command / tool. */
export interface SlashCommand {
  /** Stable identifier emitted on select. */
  id: string;
  /** Command name shown in the palette (without the leading "/"). */
  name: string;
  /** Short description shown next to the name. */
  description?: string;
  /** Optional grouping label (commands are grouped by category). */
  category?: string;
  /** Optional leading icon component. */
  icon?: ComponentType<{ className?: string }>;
}

/** Props for {@link SlashCommandPalette}. */
export interface SlashCommandPaletteProps {
  /** The local list of commands/tools to offer. */
  commands: SlashCommand[];
  /** Whether the palette is shown (typically: composer value starts with "/"). */
  open: boolean;
  /**
   * The current search query (typically the composer text after the "/").
   * Filters the list.
   */
  query?: string;
  /** Fired with the chosen command when the user selects one. */
  onSelect: (command: SlashCommand) => void;
  /** Fired when the palette should dismiss (Escape or selection). */
  onDismiss: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Group commands by their `category` (uncategorized commands go to "Commands"). */
function groupByCategory(commands: SlashCommand[]) {
  const groups = new Map<string, SlashCommand[]>();
  for (const cmd of commands) {
    const key = cmd.category ?? 'Commands';
    const list = groups.get(key) ?? [];
    list.push(cmd);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

/**
 * A command-palette dropdown triggered by "/" in the composer to pick tools or
 * commands by name, category, description, and icon — designed to layer onto a
 * `PromptInput` Tools slot. Purely presentational over a local list: the
 * consumer decides when to open it (e.g. when the composer value starts with
 * "/") and what query to pass.
 *
 * Built on the shadcn/ui `Command` (cmdk) primitive for fuzzy filtering and
 * keyboard navigation, so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <SlashCommandPalette
 *   commands={tools}
 *   open={value.startsWith('/')}
 *   query={value.slice(1)}
 *   onSelect={(cmd) => insertTool(cmd)}
 *   onDismiss={() => setValue('')}
 * />
 * ```
 */
export function SlashCommandPalette({
  commands,
  open,
  query = '',
  onSelect,
  onDismiss,
  className,
}: SlashCommandPaletteProps) {
  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className={cn(
        'w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover shadow-md',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onDismiss();
        }
      }}
    >
      <Command value={query} shouldFilter>
        <CommandInput placeholder="Search commands…" value={query} readOnly />
        <CommandList className="max-h-72 overflow-y-auto">
          <CommandEmpty>No commands found.</CommandEmpty>
          {groupByCategory(commands).map(([category, items]) => (
            <CommandGroup key={category} heading={category}>
              {items.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.name} ${cmd.description ?? ''}`}
                    onSelect={() => {
                      onSelect(cmd);
                      onDismiss();
                    }}
                  >
                    {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 truncate font-medium">/{cmd.name}</span>
                    {cmd.description && (
                      <span className="ml-auto min-w-0 max-w-[9rem] truncate text-xs text-muted-foreground">
                        {cmd.description}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
