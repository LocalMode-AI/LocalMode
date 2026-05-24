/**
 * Clause Splitter Tests
 *
 * Covers the three-pass walker that breaks paragraphs into TTS-friendly
 * clauses: sentence-end split, comma/semicolon sub-split, abbreviation
 * + decimal guards, forward-merge, blank input, word-count bounds.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { splitIntoClauses, DEFAULT_ABBREVIATIONS } from '../src/audio/clause-splitter.js';

describe('splitIntoClauses()', () => {
  describe('blank input', () => {
    it('returns [] for empty string', () => {
      expect(splitIntoClauses('')).toEqual([]);
    });

    it('returns [] for whitespace-only string', () => {
      expect(splitIntoClauses('   \n\t  ')).toEqual([]);
    });
  });

  describe('sentence boundaries', () => {
    it('splits on . ! ?', () => {
      expect(splitIntoClauses('Hello there. How are you? Great!')).toEqual([
        'Hello there.',
        'How are you?',
        'Great!',
      ]);
    });

    it('keeps a trailing fragment without sentence punctuation', () => {
      const out = splitIntoClauses('Hello there. Trailing fragment');
      expect(out).toEqual(['Hello there.', 'Trailing fragment']);
    });

    it('normalises whitespace runs', () => {
      const out = splitIntoClauses('Hello    there.\n\nHow  are\tyou?');
      expect(out).toEqual(['Hello there.', 'How are you?']);
    });

    it('produces no empty strings', () => {
      const out = splitIntoClauses('A b c d.    .    E f g h.');
      for (const c of out) expect(c.length).toBeGreaterThan(0);
    });
  });

  describe('abbreviations', () => {
    it('does not split after Dr. / Mr.', () => {
      expect(splitIntoClauses('Dr. Smith met Mr. Jones at noon today.')).toEqual([
        'Dr. Smith met Mr. Jones at noon today.',
      ]);
    });

    it('does not split after p.m.', () => {
      expect(splitIntoClauses('We met at 3 p.m. today.')).toEqual([
        'We met at 3 p.m. today.',
      ]);
    });

    it('does not split after e.g.', () => {
      expect(splitIntoClauses('Many fruits, e.g. apples, are red and tasty.')).toEqual([
        'Many fruits, e.g. apples, are red and tasty.',
      ]);
    });

    it('does not split after Ph.D.', () => {
      expect(splitIntoClauses('She earned a Ph.D. last year and now teaches.')).toEqual([
        'She earned a Ph.D. last year and now teaches.',
      ]);
    });

    it('does not split after U.S.', () => {
      expect(splitIntoClauses('Made in the U.S. and exported abroad.')).toEqual([
        'Made in the U.S. and exported abroad.',
      ]);
    });

    it('does split after a non-abbreviation period followed by a word', () => {
      // "Hello." (1 word) is below the merge threshold, so it merges into "World.".
      // To verify the splitter actually finds the boundary, pass min=1 to disable merging.
      const out = splitIntoClauses('Hello. World.', { minWordsPerClause: 1 });
      expect(out).toEqual(['Hello.', 'World.']);
    });

    it('exposes DEFAULT_ABBREVIATIONS as readonly list', () => {
      expect(DEFAULT_ABBREVIATIONS).toContain('mr.');
      expect(DEFAULT_ABBREVIATIONS).toContain('ph.d.');
      expect(DEFAULT_ABBREVIATIONS).toContain('p.m.');
    });
  });

  describe('decimal guard', () => {
    it('does not split between digits (3.14)', () => {
      expect(splitIntoClauses('Pi is 3.14 and e is 2.71.')).toEqual(['Pi is 3.14 and e is 2.71.']);
    });
  });

  describe('long-sentence sub-split', () => {
    it('splits long sentences on commas / semicolons', () => {
      const longText =
        'This is a very long sentence that goes on for many words and needs to be broken up, ' +
        'because the model handles short clauses better, and we want low latency; ' +
        'otherwise users wait too long.';
      const out = splitIntoClauses(longText);
      expect(out.length).toBeGreaterThan(1);
      for (const clause of out) {
        const wordCount = clause.split(/\s+/).filter(Boolean).length;
        expect(wordCount).toBeLessThanOrEqual(24);
      }
    });

    it('respects a custom maxWordsPerClause', () => {
      const text = 'one two three, four five six, seven eight nine, ten eleven twelve.';
      const out = splitIntoClauses(text, { maxWordsPerClause: 3, minWordsPerClause: 1 });
      expect(out.length).toBeGreaterThan(1);
      for (const clause of out) {
        const wc = clause.split(/\s+/).filter(Boolean).length;
        expect(wc).toBeLessThanOrEqual(6); // best-effort with comma boundaries
      }
    });
  });

  describe('forward-merge', () => {
    it('merges a 1-word leading clause into the next', () => {
      const out = splitIntoClauses('OK. Now let us begin the long explanation that follows.', {
        minWordsPerClause: 4,
      });
      expect(out).toEqual(['OK. Now let us begin the long explanation that follows.']);
    });

    it('keeps the final clause short if no successor exists', () => {
      const out = splitIntoClauses('We are going to begin a long explanation now. Done.', {
        minWordsPerClause: 4,
      });
      // First clause is long enough; trailing 'Done.' has no successor and stays.
      expect(out[out.length - 1]).toBe('Done.');
    });

    it('does not merge when minWordsPerClause is small', () => {
      const out = splitIntoClauses('OK. Yes. Go.', { minWordsPerClause: 1 });
      expect(out).toEqual(['OK.', 'Yes.', 'Go.']);
    });
  });

  describe('word count bounds', () => {
    it('bounds at min: every clause >= min when possible', () => {
      const text =
        'The quick brown fox jumps over the lazy dog. The fast hare leaps over the slow tortoise.';
      const out = splitIntoClauses(text, { minWordsPerClause: 3, maxWordsPerClause: 24 });
      for (let i = 0; i < out.length - 1; i++) {
        // Non-final clauses must satisfy min.
        const wc = out[i].split(/\s+/).filter(Boolean).length;
        expect(wc).toBeGreaterThanOrEqual(3);
      }
    });

    it('bounds at max: every clause <= max where punctuation allows', () => {
      const longText = Array.from({ length: 6 }, () => 'word').join(' ') +
        ', ' +
        Array.from({ length: 30 }, () => 'word').join(' ') +
        '.';
      const out = splitIntoClauses(longText, { maxWordsPerClause: 10, minWordsPerClause: 1 });
      // We can't guarantee max if there is no punctuation to split on, so we
      // verify the algorithm broke at the comma.
      expect(out.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Scenario tests from spec', () => {
    it('Scenario: Splits on sentence-ending punctuation', () => {
      expect(splitIntoClauses('Hello there. How are you? Great!')).toEqual([
        'Hello there.',
        'How are you?',
        'Great!',
      ]);
    });

    it('Scenario: Honours abbreviation list', () => {
      expect(splitIntoClauses('Dr. Smith met Mr. Jones at 3 p.m. today.')).toEqual([
        'Dr. Smith met Mr. Jones at 3 p.m. today.',
      ]);
    });

    it('Scenario: Does not split on decimal points in numbers', () => {
      expect(splitIntoClauses('Pi is 3.14 and e is 2.71.')).toEqual(['Pi is 3.14 and e is 2.71.']);
    });

    it('Scenario: Merges very short clauses forward', () => {
      expect(
        splitIntoClauses('OK. Now let us begin the long explanation that follows.', {
          minWordsPerClause: 4,
        })
      ).toEqual(['OK. Now let us begin the long explanation that follows.']);
    });
  });
});

