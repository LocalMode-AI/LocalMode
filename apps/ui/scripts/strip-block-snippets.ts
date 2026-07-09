//
// @file strip-block-snippets.ts
// @description Shared AST snippet-hygiene transform for the SHIPPED block
// surfaces. Exposes a pure stripSnippet(source) invoked from both call sites:
// generate-block-source.ts (Code-tab snapshots) and strip-registry-blocks.ts
// (the public/r/ui/blocks JSON file `content` payloads). It removes every
// data-testid from JSX (element attributes AND object-spread keys) and all
// comments except a leading @file / @description / @constraint header re-emitted
// as at most 3 lines and any KEEP-tagged constraint comment.
//
// Why ts-morph and not the raw TypeScript printer: ts.createPrinter() re-emits
// the entire file from the AST, discarding original trivia/formatting, so every
// untouched snippet would be cosmetically reflowed vs. its source (churned diffs,
// defeating "faithful snippet"). This module instead uses the ts-morph/TS AST +
// comment scanner ONLY to compute exact source RANGES, then splices those ranges
// out of the ORIGINAL string. Untouched code stays byte-identical; the AST is the
// oracle for WHAT to cut, never the emitter. Regex is not used to find nodes —
// JSX attribute edges, object-literal commas, line/block comment sequences inside
// template literals, and JSX text are all resolved structurally by the parser.
//
import { Project, SyntaxKind, ts } from 'ts-morph';

/** A single splice: replace [start, end) in the original source with `text`. */
interface Edit {
  start: number;
  end: number;
  text: string;
}

const WS = /\s/;

/**
 * Strip dev-only snippet noise (`data-testid`, QA/E2E comments) from a block
 * source string. Pure: same input → same output; no filesystem access.
 *
 * @param source - The raw `.tsx`/`.ts` block source.
 * @returns The stripped source; untouched code is byte-identical to the input.
 */
export function stripSnippet(source: string): string {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true },
  });
  const sf = project.createSourceFile('__snippet__.tsx', source, { overwrite: true });
  const fullText = sf.getFullText();

  const edits: Edit[] = [];

  // 1) `data-testid` JSX attributes: `data-testid="…"` and `data-testid={…}`.
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== 'data-testid') continue;
    edits.push(removalWithLeadingWhitespace(fullText, attr.getStart(), attr.getEnd()));
  }

  // 2) `data-testid` object-literal keys spread into JSX
  //    (e.g. `{...(cond ? { 'data-testid': id } : {})}`). These are not JSX
  //    attributes but still land in the shipped payload, so they must go too.
  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const nameText = prop.getNameNode().getText();
    if (nameText !== 'data-testid' && nameText !== "'data-testid'" && nameText !== '"data-testid"') {
      continue;
    }
    edits.push(removePropertyAssignment(fullText, prop.getStart(), prop.getEnd()));
  }

  // 3) Comments: rebuild the leading banner to ≤3 lines, keep `/** KEEP */`
  //    comments verbatim, remove everything else.
  const comments = collectComments(sf.compilerNode);
  const banner = comments.find(
    (c) => c.kind === ts.SyntaxKind.MultiLineCommentTrivia && fullText.slice(c.pos, c.end).includes('@file'),
  );
  for (const c of comments) {
    if (banner && c.pos === banner.pos) {
      edits.push({ start: c.pos, end: c.end, text: rebuildHeader(fullText.slice(c.pos, c.end)) });
      continue;
    }
    if (isKeepComment(fullText.slice(c.pos, c.end))) continue; // retain verbatim
    edits.push(removeComment(fullText, c.pos, c.end));
  }

  return applyEdits(fullText, edits);
}

/**
 * Enumerate every comment in the file via the AST (leading + trailing trivia of
 * every node AND every punctuation token — `getChildren` descends into tokens,
 * so a comment embedded in an empty `{/* … *​/}` JSX expression is captured as
 * the close-brace's leading trivia), deduped by position. Because comment ranges
 * are computed from token full-starts, `//`/`/* *​/` sequences inside template
 * literals, strings, regexes, and JSX text are never mistaken for comments.
 */
function collectComments(root: ts.SourceFile): ts.CommentRange[] {
  const fullText = root.text;
  const seen = new Set<number>();
  const out: ts.CommentRange[] = [];
  const add = (ranges: readonly ts.CommentRange[] | undefined) => {
    if (!ranges) return;
    for (const r of ranges) {
      if (!seen.has(r.pos)) {
        seen.add(r.pos);
        out.push(r);
      }
    }
  };
  const visit = (node: ts.Node) => {
    add(ts.getLeadingCommentRanges(fullText, node.getFullStart()));
    add(ts.getTrailingCommentRanges(fullText, node.getEnd()));
    for (const child of node.getChildren(root)) visit(child);
  };
  visit(root);
  out.sort((a, b) => a.pos - b.pos);
  // Containment dedupe: position-based ts.get{Leading,Trailing}CommentRanges can
  // mis-lex when a scan starts inside a real comment (e.g. the literal
  // `@localmode/*` inside a JSDoc spawns a bogus nested range at that `/*`).
  // Real comments never nest, so any range fully contained in the previous
  // kept range is a scanner artifact — drop it.
  const kept: ts.CommentRange[] = [];
  let maxEnd = -1;
  for (const r of out) {
    if (r.end <= maxEnd) continue;
    kept.push(r);
    maxEnd = Math.max(maxEnd, r.end);
  }
  return kept;
}

/** `/** KEEP *​/`-style constraint comments are retained verbatim. */
function isKeepComment(text: string): boolean {
  return /\bKEEP\b/.test(text);
}

/**
 * Rebuild a header banner into at most 3 content lines: `@file`, the first
 * physical line of `@description`, and (optionally) one `@constraint` line.
 */
function rebuildHeader(comment: string): string {
  const inner = comment.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
  const lines = inner.split('\n').map((l) => l.replace(/^\s*\*? ?/, '').replace(/\s+$/, ''));
  const fileLine = lines.find((l) => l.startsWith('@file'));
  const descLine = lines.find((l) => l.startsWith('@description'));
  const constraintLine = lines.find((l) => l.startsWith('@constraint'));
  const kept = [fileLine, descLine, constraintLine].filter((l): l is string => Boolean(l));
  const body = kept.map((l) => ` * ${l}`);
  return ['/**', ...body, ' */'].join('\n');
}

/**
 * Remove `[start, end)` plus the whitespace run immediately preceding it, so a
 * removed JSX attribute leaves no double-space or dangling indent.
 */
function removalWithLeadingWhitespace(fullText: string, start: number, end: number): Edit {
  let s = start;
  while (s > 0 && WS.test(fullText[s - 1])) s--;
  return { start: s, end, text: '' };
}

/**
 * Remove an object `PropertyAssignment` named `data-testid`, absorbing a trailing
 * (or, failing that, a preceding) comma, then removing the whole line if the
 * property occupied one on its own.
 */
function removePropertyAssignment(fullText: string, start: number, end: number): Edit {
  let editEnd = end;
  // absorb a trailing comma (skip whitespace up to it)
  let i = end;
  while (i < fullText.length && WS.test(fullText[i])) i++;
  if (fullText[i] === ',') {
    editEnd = i + 1;
  } else {
    // no trailing comma → absorb a preceding comma if present
    let j = start;
    while (j > 0 && WS.test(fullText[j - 1])) j--;
    if (fullText[j - 1] === ',') start = j - 1;
  }
  return removeLineIfStandalone(fullText, start, editEnd);
}

/** Remove a comment; whole-line if it stands alone, else the range + one gap. */
function removeComment(fullText: string, start: number, end: number): Edit {
  return removeLineIfStandalone(fullText, start, end);
}

/**
 * If the range occupies its own line(s) (only whitespace before it on its first
 * line and only whitespace after it on its last line), remove the whole span
 * including the trailing newline. Otherwise remove just the range plus the run
 * of spaces/tabs immediately before it (cleans a trailing `code; // note`).
 */
function removeLineIfStandalone(fullText: string, start: number, end: number): Edit {
  let lineStart = start;
  while (lineStart > 0 && fullText[lineStart - 1] !== '\n') lineStart--;
  const beforeBlank = fullText.slice(lineStart, start).trim() === '';

  let lineEnd = end;
  while (lineEnd < fullText.length && fullText[lineEnd] !== '\n') lineEnd++;
  const afterBlank = fullText.slice(end, lineEnd).trim() === '';

  if (beforeBlank && afterBlank) {
    const removeEnd = lineEnd < fullText.length ? lineEnd + 1 : lineEnd;
    return { start: lineStart, end: removeEnd, text: '' };
  }

  let s = start;
  while (s > 0 && (fullText[s - 1] === ' ' || fullText[s - 1] === '\t')) s--;
  return { start: s, end, text: '' };
}

/** Apply edits by splicing from the end backward so earlier offsets stay valid. */
function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let prevStart = source.length;
  let result = source;
  for (const edit of sorted) {
    if (edit.end > prevStart) {
      // Overlapping edits would corrupt the splice — the transform's edit
      // sources (JSX attrs, object props, comments) never overlap, so this is
      // a hard invariant, not a recoverable case.
      throw new Error(
        `stripSnippet: overlapping edit [${edit.start}, ${edit.end}) vs next start ${prevStart}`,
      );
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    prevStart = edit.start;
  }
  return result;
}
