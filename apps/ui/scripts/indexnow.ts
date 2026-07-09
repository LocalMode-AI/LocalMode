/**
 * @file indexnow.ts
 * @description IndexNow submitter (seo.md §10) — pings Bing/Yandex/IndexNow with
 * the site's URLs for near-instant (re)indexing. Env-gated: does nothing unless
 * INDEXNOW_KEY is set. Run manually after a deploy: `INDEXNOW_KEY=… tsx scripts/indexnow.ts`.
 *
 * Setup (one-time): generate a key (`uuidgen`), then serve it verbatim at
 * `public/<INDEXNOW_KEY>.txt` (the file's only content is the key). See seo.md §10.1.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';
const INDEXNOW_KEY = process.env.INDEXNOW_KEY;

async function main() {
  if (!INDEXNOW_KEY) {
    console.log('[indexnow] INDEXNOW_KEY not set — skipping (see scripts/indexnow.ts header).');
    return;
  }

  // Pull the live URL set from the sitemap so this never drifts from the site.
  const res = await fetch(`${SITE_URL}/sitemap.xml`);
  if (!res.ok) throw new Error(`[indexnow] could not fetch sitemap.xml (${res.status})`);
  const xml = await res.text();
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) {
    console.log('[indexnow] sitemap had no <loc> entries — nothing to submit.');
    return;
  }

  const host = new URL(SITE_URL).host;
  // IndexNow accepts up to 10,000 URLs per request; batch conservatively.
  const BATCH = 100;
  for (let i = 0; i < urlList.length; i += BATCH) {
    const urlBatch = urlList.slice(i, i + BATCH);
    const submit = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urlBatch,
      }),
    });
    console.log(`[indexnow] submitted ${urlBatch.length} URLs → ${submit.status} ${submit.statusText}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
