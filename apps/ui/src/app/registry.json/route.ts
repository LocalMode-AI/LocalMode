/**
 * @file route.ts
 * @description Serves the full `registry.json` catalog at `/registry.json` so
 * the shadcn registry-MCP integration (and tools like Cursor / Windsurf) can
 * discover and add LocalMode items. Fumadocs has no MCP server of its own; this
 * follows shadcn's registry-MCP convention (expose the catalog) and is patterned
 * on registry-starter. The catalog is read from the repo's `registry.json`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  const file = path.join(process.cwd(), 'registry.json');
  const body = await readFile(file, 'utf8');
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
