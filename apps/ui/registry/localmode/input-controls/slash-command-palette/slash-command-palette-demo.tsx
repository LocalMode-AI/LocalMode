'use client';

import { useState } from 'react';
import { Search, Image, FileText, Calculator } from 'lucide-react';
import {
  SlashCommandPalette,
  type SlashCommand,
} from './slash-command-palette';

const COMMANDS: SlashCommand[] = [
  { id: 'search', name: 'search', description: 'Search the web', category: 'Tools', icon: Search },
  { id: 'image', name: 'image', description: 'Generate an image', category: 'Tools', icon: Image },
  { id: 'summarize', name: 'summarize', description: 'Summarize a document', category: 'Text', icon: FileText },
  { id: 'calc', name: 'calc', description: 'Evaluate an expression', category: 'Text', icon: Calculator },
];

/**
 * Demo for SlashCommandPalette, used by the docs live preview. Type "/" in the
 * composer to open the palette; keep typing to filter; select a command to
 * insert its name and dismiss. Pure UI — no model download.
 */
export default function SlashCommandPaletteDemo() {
  // Seed with "/" so the palette renders open in the docs preview.
  const [value, setValue] = useState('/');
  const [chosen, setChosen] = useState<string | null>(null);

  const open = value.startsWith('/');

  return (
    <div className="relative flex min-h-[18rem] w-full max-w-sm flex-col gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type / to open the palette…"
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {open && (
        <div className="relative z-10">
          <SlashCommandPalette
            commands={COMMANDS}
            open={open}
            query={value.slice(1)}
            onSelect={(cmd) => {
              setChosen(cmd.name);
              setValue(`/${cmd.name} `);
            }}
            onDismiss={() => setValue('')}
          />
        </div>
      )}
      {chosen && (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="font-mono">/{chosen}</span>
        </p>
      )}
    </div>
  );
}
