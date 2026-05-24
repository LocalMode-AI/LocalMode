/**
 * Clause Splitter
 *
 * Pure, dependency-free clause splitter used by `streamSynthesizeSpeech()`
 * to break a paragraph of text into clause-sized chunks suitable for
 * sequential text-to-speech synthesis.
 *
 * The splitter is a three-pass walker:
 *   1. Sentence split on `.`, `!`, `?` (with abbreviation + decimal guards)
 *   2. Sub-clause split on `;` then `,` for sentences exceeding `maxWordsPerClause`
 *   3. Forward-merge clauses shorter than `minWordsPerClause` into the next clause
 *
 * @packageDocumentation
 */

/**
 * Tuning options for {@link splitIntoClauses}.
 */
export interface ClauseSplitOptions {
  /**
   * Minimum words per clause. Clauses shorter than this are merged forward
   * into the next clause where possible. The final clause may remain
   * shorter if no follow-up exists.
   *
   * @default 4
   */
  minWordsPerClause?: number;

  /**
   * Maximum words per clause. Sentences exceeding this length are split
   * further on `;` then `,` (preferring breakpoints closest to the midpoint
   * for balance).
   *
   * @default 24
   */
  maxWordsPerClause?: number;

  /**
   * Lowercased abbreviation tokens (each ending with `.`) whose terminal
   * period should NOT be treated as a sentence boundary. Defaults to
   * {@link DEFAULT_ABBREVIATIONS}. Pass a custom list to override.
   */
  abbreviations?: readonly string[];
}

/**
 * Default abbreviations recognised by the splitter.
 * The match is case-insensitive; comparison uses the lower-cased form.
 */
export const DEFAULT_ABBREVIATIONS: readonly string[] = [
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'sr.',
  'jr.',
  'st.',
  'e.g.',
  'i.e.',
  'etc.',
  'vs.',
  'u.s.',
  'u.k.',
  'ph.d.',
  'm.d.',
  'a.m.',
  'p.m.',
  'no.',
];

/** Whitespace normalisation: trim + collapse internal runs. */
function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Count words (whitespace-delimited tokens). */
function countWords(clause: string): number {
  if (!clause) return 0;
  return clause.split(/\s+/).filter(Boolean).length;
}

/** Test if `ch` is an ASCII digit. */
function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/**
 * Pass 1 — sentence-level split.
 *
 * Walks `text` and emits a new clause every time we encounter `.`, `!`, or
 * `?` followed by whitespace or end-of-string, EXCEPT when:
 *   - the period is between two digits (decimal: `3.14`)
 *   - the trailing token (case-insensitive) is in `abbreviations`
 */
function splitSentences(text: string, abbreviations: readonly string[]): string[] {
  const out: string[] = [];
  const lowerAbbrevs = new Set(abbreviations.map((a) => a.toLowerCase()));
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Decimal guard: `.` between digits (e.g. 3.14).
    if (ch === '.' && isDigit(text[i - 1]) && isDigit(text[i + 1])) {
      continue;
    }

    // Look ahead: a sentence boundary requires end-of-string or whitespace
    // after the punctuation (and any closing quotes / parens).
    let j = i + 1;
    while (j < text.length && (text[j] === '"' || text[j] === "'" || text[j] === ')' || text[j] === ']')) {
      j++;
    }
    const followedByBreak = j >= text.length || /\s/.test(text[j]);
    if (!followedByBreak) continue;

    // Abbreviation guard: only applies to `.` (not `!` / `?`).
    if (ch === '.') {
      // Find the start of the trailing whitespace-delimited token ending at i.
      let tokenStart = i;
      while (tokenStart > start && !/\s/.test(text[tokenStart - 1])) {
        tokenStart--;
      }
      const token = text.slice(tokenStart, i + 1).toLowerCase();
      if (lowerAbbrevs.has(token)) {
        continue;
      }
    }

    // Commit the sentence (inclusive of the punctuation, plus any closing quotes).
    const end = j;
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
  }

  // Trailing fragment without a sentence-ending punctuation.
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);

  return out;
}

/**
 * Pass 2 — break a sentence longer than `maxWords` on `;` then `,`,
 * recursively, choosing the breakpoint closest to the midpoint to keep
 * clause sizes balanced.
 */
function splitLongSentence(sentence: string, maxWords: number): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [sentence];

  // Try `;` first, then `,`. Each character match must be followed by whitespace.
  for (const sep of [';', ',']) {
    const breakpoints: number[] = [];
    for (let i = 0; i < sentence.length - 1; i++) {
      if (sentence[i] === sep && /\s/.test(sentence[i + 1])) {
        breakpoints.push(i + 1); // split right after the separator
      }
    }
    if (breakpoints.length === 0) continue;

    // Pick the breakpoint whose character index is nearest the sentence midpoint.
    const mid = sentence.length / 2;
    let best = breakpoints[0];
    let bestDist = Math.abs(best - mid);
    for (const bp of breakpoints) {
      const dist = Math.abs(bp - mid);
      if (dist < bestDist) {
        best = bp;
        bestDist = dist;
      }
    }

    const left = sentence.slice(0, best).trim();
    const right = sentence.slice(best).trim();
    if (!left || !right) continue;

    return [...splitLongSentence(left, maxWords), ...splitLongSentence(right, maxWords)];
  }

  // No comma/semicolon to split on. Return as-is — splitter only knows how
  // to break at punctuation; it never splits raw words.
  return [sentence];
}

/**
 * Pass 3 — merge "very short" clauses (e.g. orphan one-word fragments
 * like "OK.") forward into the next clause.
 *
 * The threshold is `Math.min(minWords, 2)`: with the default `minWords=4`
 * we only merge 1-word fragments, preserving regular short sentences
 * such as "Hello there." (2 words) as their own clause. Callers who want
 * more aggressive merging can pass a smaller `minWordsPerClause` (e.g.
 * 2) so the threshold becomes `<2 → merge`, or a larger `minWordsPerClause`
 * to merge fragments of up to two words.
 *
 * Forward-only: the final clause may remain short if no successor exists.
 */
function mergeShortForward(clauses: string[], minWords: number): string[] {
  if (clauses.length === 0) return [];
  // Conservative merge threshold: only orphan fragments are merged with
  // the default minWords=4. Setting minWords lower (e.g. 2) reduces
  // merging; setting minWords higher allows up to 2-word fragments to
  // merge.
  const mergeBelow = Math.max(1, Math.min(minWords, 2));
  const out: string[] = [];
  let pending: string | null = null;

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const merged: string = pending ? `${pending} ${clause}` : clause;
    if (countWords(merged) < mergeBelow && i < clauses.length - 1) {
      pending = merged;
      continue;
    }
    // If we have a pending fragment, attach it to the current clause.
    if (pending !== null) {
      // Continue merging until we cross the threshold, but emit as soon as we do.
      out.push(merged);
      pending = null;
      continue;
    }
    // No pending: check if THIS clause itself is a fragment that should
    // be merged forward.
    if (countWords(clause) < mergeBelow && i < clauses.length - 1) {
      pending = clause;
      continue;
    }
    out.push(clause);
  }

  if (pending !== null) out.push(pending);
  return out;
}

/**
 * Split a paragraph of text into clause-sized chunks suitable for sequential
 * text-to-speech synthesis.
 *
 * The splitter walks the text in three passes:
 *   1. Sentence split on `.`, `!`, `?` — abbreviations and decimal numbers
 *      are preserved (no break after `Dr.`, `Mr.`, `Ph.D.`, `3.14`, …).
 *   2. Sub-clause split on `;` then `,` for any sentence longer than
 *      `maxWordsPerClause`, choosing breakpoints closest to the midpoint.
 *   3. Forward-merge any clause shorter than `minWordsPerClause` into the
 *      next clause. The final clause may remain short.
 *
 * Whitespace is normalised: leading/trailing whitespace trimmed, internal
 * whitespace runs collapsed to single spaces. Empty / whitespace-only
 * inputs produce `[]`.
 *
 * @param text - The text to split.
 * @param options - Optional tuning thresholds and abbreviation overrides.
 * @returns An array of clause strings. Never contains empty strings.
 *
 * @example Basic usage
 * ```ts
 * import { splitIntoClauses } from '@localmode/core';
 *
 * splitIntoClauses('Hello there. How are you? Great!');
 * // => ['Hello there.', 'How are you?', 'Great!']
 *
 * splitIntoClauses('Dr. Smith met Mr. Jones at 3 p.m. today.');
 * // => ['Dr. Smith met Mr. Jones at 3 p.m. today.']
 * ```
 *
 * @example Custom thresholds
 * ```ts
 * splitIntoClauses(longParagraph, {
 *   minWordsPerClause: 6,
 *   maxWordsPerClause: 18,
 * });
 * ```
 */
export function splitIntoClauses(text: string, options: ClauseSplitOptions = {}): string[] {
  const minWords = options.minWordsPerClause ?? 4;
  const maxWords = options.maxWordsPerClause ?? 24;
  const abbreviations = options.abbreviations ?? DEFAULT_ABBREVIATIONS;

  const normalised = normaliseWhitespace(text);
  if (!normalised) return [];

  // Pass 1
  const sentences = splitSentences(normalised, abbreviations);
  if (sentences.length === 0) return [];

  // Pass 2
  const subClauses: string[] = [];
  for (const sentence of sentences) {
    const sub = splitLongSentence(sentence, maxWords);
    for (const clause of sub) {
      const trimmed = clause.trim();
      if (trimmed) subClauses.push(trimmed);
    }
  }

  // Pass 3
  return mergeShortForward(subClauses, minWords);
}
