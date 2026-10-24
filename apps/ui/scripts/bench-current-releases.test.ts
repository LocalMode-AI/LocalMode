/**
 * The `current-releases` bundle: the committed generated files are exactly
 * what the build script produces from today's provider source and the
 * installed current releases (so a provider change cannot ship a stale
 * bundle), each bundle imports its runtime only through the alias of the
 * current release, and the wllama bundle's CDN pins point at that release.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCurrentReleaseProviders,
  CURRENT_RELEASES_DIR,
  currentReleaseVersions,
  rewriteWllamaCdn,
  wllamaPinnedVersion,
} from './build-current-release-providers';

const appPkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };

describe('the current-releases bundle', () => {
  it('the committed files equal a fresh build', async () => {
    const files = await buildCurrentReleaseProviders();
    expect(Object.keys(files).sort()).toEqual([
      'litert.generated.js',
      'transformers.generated.js',
      'versions.generated.ts',
      'webllm.generated.js',
      'wllama.generated.js',
    ]);
    for (const [name, text] of Object.entries(files)) {
      expect(readFileSync(join(CURRENT_RELEASES_DIR, name), 'utf8'), `${name} is stale: run pnpm bench:current-releases`).toBe(text);
    }
  }, 60_000);

  it('records the releases apps/ui installs under the -current aliases', () => {
    const alias = (name: string) => appPkg.dependencies[name].replace(/^npm:@?[^@]+@/, '');
    const versions = currentReleaseVersions();
    expect(versions['@huggingface/transformers']).toBe(alias('@huggingface/transformers-current'));
    expect(versions['@mlc-ai/web-llm']).toBe(alias('@mlc-ai/web-llm-current'));
    expect(versions['@litert-lm/core']).toBe(alias('@litert-lm/core-current'));
    expect(versions['@wllama/wllama']).toBe(alias('@wllama/wllama-current'));
    expect(versions['@wllama/wllama-compat']).toBe(versions['@wllama/wllama']);
    expect(versions['onnxruntime-web']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('each bundle imports its runtime only through the current-release alias, and @localmode/core as the shared package', () => {
    const read = (name: string) => readFileSync(join(CURRENT_RELEASES_DIR, name), 'utf8');
    const specifiers = (text: string) => new Set([...text.matchAll(/(?:from|import\()\s*"([^".][^"]*)"/g)].map((m) => m[1]));
    expect(specifiers(read('transformers.generated.js'))).toEqual(new Set(['@localmode/core', '@huggingface/transformers-current']));
    expect(specifiers(read('webllm.generated.js'))).toEqual(new Set(['@mlc-ai/web-llm-current']));
    expect(specifiers(read('litert.generated.js'))).toEqual(new Set(['@localmode/core', '@litert-lm/core-current']));
    expect(specifiers(read('wllama.generated.js'))).toEqual(new Set(['@localmode/core', '@huggingface/gguf']));
    const wllama = read('wllama.generated.js');
    const version = currentReleaseVersions()['@wllama/wllama'];
    expect([...wllama.matchAll(/cdn\.jsdelivr\.net\/npm\/@wllama\/(wllama|wllama-compat)@(\d+\.\d+\.\d+)/g)].map((m) => `${m[1]}@${m[2]}`).sort()).toEqual([
      `wllama-compat@${version}`,
      `wllama-compat@${version}`,
      `wllama@${version}`,
    ]);
  });

  it('rewriteWllamaCdn moves the three CDN pins to the release and refuses any other count', () => {
    const loader = [
      "const WLLAMA_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1';",
      "worker: 'https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.5.1/wasm/wllama.js',",
      "wasm: 'https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.5.1/wasm/wllama.wasm',",
      '// 3.5.1 is the minimum version that ships createRerank',
    ].join('\n');
    expect(wllamaPinnedVersion(loader)).toBe('3.5.1');
    const out = rewriteWllamaCdn(loader, '3.8.1');
    expect(out).toContain('@wllama/wllama@3.8.1');
    expect(out.match(/wllama-compat@3\.8\.1/g)).toHaveLength(2);
    expect(out).toContain('// 3.5.1 is the minimum version');
    expect(() => rewriteWllamaCdn(loader.split('\n').slice(1).join('\n'), '3.8.1')).toThrow('expected 3 wllama CDN URLs in wllama-loader.ts, found 2');
    expect(() => wllamaPinnedVersion(`${loader}\nhttps://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.0`)).toThrow('expected one pinned wllama CDN version');
  });
});
