/**
 * @file route.ts
 * @description Registry JSON serving route — cherry-picked from registry-starter
 * (Fumadocs provides no registry serving) and implemented to match this app's
 * route conventions. Serves the per-item JSON that `shadcn build` emitted into
 * `public/r/`. Item names carry the `ui/` prefix, so `@localmode/ui/local-first/device-badge`
 * resolves to `/r/ui/local-first/device-badge.json` → `public/r/ui/local-first/device-badge.json`.
 *
 * Token-gating for protected items is enforced upstream in `middleware.ts`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const R_DIR = path.join(process.cwd(), 'public', 'r');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string[] }> },
) {
  const { name } = await params;
  // Join the catch-all segments back into the item path (already ends in .json).
  const rel = name.join('/');

  // Reject path traversal — only allow the registry directory.
  const target = path.normalize(path.join(R_DIR, rel));
  if (!target.startsWith(R_DIR + path.sep)) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!target.endsWith('.json')) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const body = await readFile(target, 'utf8');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse(
      JSON.stringify({ error: `Registry item not found: ${rel}` }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
}
