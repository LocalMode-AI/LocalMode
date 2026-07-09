import { blockSources } from './block-source.generated';

/** Read a block implementation's source snapshot, or null if unavailable. */
export function readBlockSource(name: string): string | null {
  return blockSources[name] ?? null;
}
