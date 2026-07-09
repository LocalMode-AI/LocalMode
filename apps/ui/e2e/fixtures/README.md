# E2E media fixtures

## Image-studio fixtures (`image-studio/`)

Two committed images drive `e2e/blocks/image-studio.spec.ts` (Remove BG + Enhance
lanes). Both are (re)generated deterministically by the committed script:

```sh
# from apps/ui — needs only a normal pnpm install (@playwright/test devDep)
node e2e/fixtures/generate-image-studio-fixtures.mjs
```

- **`subject.png`** (512×384) — a clean outdoor-style scene with three clearly
  separable regions (a light-blue SKY band, a green GROUND band, and a large dark
  centered SUBJECT), rendered by a Chromium screenshot of styled HTML. SegFormer
  (`Xenova/segformer-b0-finetuned-ade-512-512`, ADE20K) reliably segments it into
  multiple masks, so the highest-scoring mask is **partial** — applying it as an
  alpha channel yields a meaningfully transparent background with an opaque
  subject. The spec decodes the produced PNG at the **byte level** (a zlib-inflate
  + defilter RGBA decoder) and asserts IHDR color type 6 with a transparent
  fraction in a broad sane band (some transparent AND some opaque) — coarse
  invariants, not an exact mask (masks vary; the fixture's clean subject/ground
  split keeps it in-band).
- **`sr-input.png`** (96×64) — a small, high-frequency image (sharp `SR` text +
  thin magenta/yellow stripes + hard color edges), same screenshot technique.
  Small so Swin2SR 2x/4x runs fast with an **exact** dimension check (2x →
  192×128, 4x → 384×256); high-frequency so the upscaled output is a real,
  content-bearing super-resolution rather than a flat no-op copy. Also fed to the
  Caption tool's "add another" lane (a valid second image).

The captioning fixture is the football-match photo
`public/test-assets/portrait.jpg` (800×533, COCO `person` / `sports ball`
content), referenced in-place by the spec — the caption assertion checks the
real ViT-GPT2 output for a person/sport subject term.

## Knowledge-base fixtures (`kb-*`)

Five fixtures drive `e2e/blocks/knowledge.spec.ts`. All are generated
deterministically by the committed script:

```sh
# from apps/ui — needs only a normal pnpm install (@playwright/test devDep)
node e2e/fixtures/generate-kb-fixtures.mjs
```

### `kb-fixture.pdf`

A minimal, valid, single-page **text-based** PDF, hand-encoded in raw PDF 1.4
syntax by the generator (no PDF library; xref offsets computed
programmatically). Extractable text:
`LocalMode processes documents entirely in the browser using WebAssembly`.
Drives the Ingest tab's PDF lane (`extractPDFText` → page-attributed chunks).

Verification: `@localmode/pdfjs` wires a browser CDN worker, so the commit-time
probe ran `pdfjs-dist` (the exact library it wraps, from
`packages/pdfjs/node_modules`) via its Node legacy build — `numPages: 1` and
the full sentence extract cleanly. The spec then re-verifies the real
browser path end-to-end (upload → extract → index → search hit).

### `kb-ocr.png`

960×200 PNG, one machine-printed line `LOCAL FIRST OCR TEST` (64px bold
Arial, black on white) — rendered by a Playwright Chromium screenshot of a
styled HTML string (deterministic, no extra deps). Ideal line-level input for
the OCR lane's default `Xenova/trocr-small-printed` model.

### `kb-invoice.png`

800×1000 PNG of a synthetic machine-printed invoice (`INVOICE #4021`,
`Vendor: Acme Corp`, `Date: 2026-06-15`, two line items,
`Total: $1,234.56`), same screenshot technique. Drives the Ask tab's Donut
DocVQA lane (`What is the total amount?`).

### `kb-pinecone.json`

A Pinecone-format vector export — `{ "vectors": [{ id, values, metadata }] }`
with 3 records, 384-dim vectors (seeded mulberry32 PRNG, byte-stable across
regenerations), and `metadata.text/title/category`. The shape is grounded in
`packages/core/src/import-export/parsers/pinecone.ts` and `detect.ts`
(verified at generation time: `detectFormat` → `pinecone`,
`parseExternalFormat` → 3 records, 384 dims). 384 dims matches the block's
default `Xenova/bge-small-en-v1.5` index, so records take the Data tab's
direct import lane.

### `kb-export.csv`

A CSV vector export with header `id,title,category,text` and 3 **text-only**
rows (no vector column; fields contain no commas so no RFC 4180 quoting is
needed). Grounded in `packages/core/src/import-export/parsers/csv.ts` +
`detect.ts` (verified: `detectFormat` → `csv`, 3 records, no vectors). The
missing vectors deliberately exercise the Data tab's re-embed toggle lane.

## `voice-fixture.wav`

Real spoken English used as Chromium's fake microphone input
(`--use-file-for-fake-audio-capture`) in `e2e/blocks/audio-blocks.spec.ts`
(the grown phase0 voice spec), so the audio-studio block captures genuine
speech through the real `getUserMedia` path and Whisper performs genuine
speech recognition on it — the Notes record lane AND the Live streaming lane
both feed on it.

- **Content**: "The quick brown fox jumps over the lazy dog" (macOS `say`,
  Samantha voice)
- **Format**: WAVE, PCM signed 16-bit little-endian (LEI16), mono, 16000 Hz,
  ~2.5 s — a format Chromium's fake audio capture accepts.
- **Expected assertions**: the Whisper transcript must contain at least 2 of
  `quick`, `brown`, `fox`, `lazy`, `dog` (lowercased containment; whisper-tiny
  on synthetic speech is imperfect, so single-word misses are tolerated
  without loosening the real-recognition proof).

### Regenerating (macOS)

```sh
say -v Samantha -o /tmp/voice-fixture.aiff "The quick brown fox jumps over the lazy dog"
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/voice-fixture.aiff apps/ui/e2e/fixtures/voice-fixture.wav
```

Verify with `afinfo apps/ui/e2e/fixtures/voice-fixture.wav` — expect
`WAVE`, `1 ch, 16000 Hz, Int16`, estimated duration ~2.5 s.

Note: Chromium loops the file for the lifetime of the fake capture stream, so
a ~4 s recording window captures the full phrase at least once.

## `meeting-fixture.wav`

Real spoken English uploaded as the Meeting tab's audio-path input in
`e2e/blocks/audio-blocks.spec.ts` (also usable as a second, semantically
distinct voice note for the note-search ranking assertion).

- **Content**: "We must finish the budget report by Friday. John will
  schedule the client meeting next week." (macOS `say`, Samantha voice)
- **Format**: WAVE, PCM signed 16-bit little-endian (LEI16), mono, 16000 Hz,
  ~5.2 s.
- **Expected assertions**: the transcript must contain at least 2 of
  `budget`, `report`, `friday`, `schedule`, `client`, `meeting` (lowercased
  containment).

### Regenerating (macOS)

```sh
say -v Samantha -o /tmp/meeting-fixture.aiff "We must finish the budget report by Friday. John will schedule the client meeting next week."
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/meeting-fixture.aiff apps/ui/e2e/fixtures/meeting-fixture.wav
```

## `meeting-transcript.txt`

A deterministic meeting transcript pasted into the Meeting tab's
paste-transcript path in `e2e/blocks/audio-blocks.spec.ts` — it gives the
summary and action-item assertions a stable, speech-recognition-free input.

- **Topic**: quarterly budget planning (the DistilBART summary must mention
  at least one of `budget`, `quarter`, `report`, `meeting`, `finance`,
  `marketing`).
- **Commitments**: written with blatant action-item language ("We must
  finalize the quarterly budget report by Friday, this is urgent…", "John
  will schedule a follow-up meeting…", "Maria agreed to send the updated
  hiring plan…") so the Granite 4.0 350M structured extraction has clear
  targets — the spec asserts at least one extracted item whose
  `data-priority` is `high`, `medium`, or `low`.

## `vision-fixture.y4m`

A real photograph played as Chromium's fake webcam
(`--use-file-for-fake-video-capture`) in `e2e/blocks/vision.spec.ts`
(Detect lanes), so the block's `getUserMedia` stream carries genuine
photographic frames and MediaPipe BlazeFace performs genuine face detection
on them.

- **Source photo**: `apps/ui/public/test-assets/portrait.jpg` (800x533 JPEG) —
  a football-match scene with multiple clearly visible people and a sports
  ball (COCO classes `person` / `sports ball`). The same photo is the subject
  image of the block's DETR object-detection flow (`/test-assets/portrait.jpg`),
  so the fake-camera frames and the DETR subject stay in sync.
- **Format**: YUV4MPEG2 (uncompressed), 640x480 (aspect-preserving scale +
  letterbox pad), yuv420p, 5 fps, 2 s (10 frames), ~4.4 MB. Chromium loops the
  file for the lifetime of the fake capture stream; the content is a static
  photo, so 5 fps loses nothing and keeps the uncompressed file small.

### Regenerating

```sh
ffmpeg -y -loop 1 -i apps/ui/public/test-assets/portrait.jpg -t 2 -r 5 \
  -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -pix_fmt yuv420p apps/ui/e2e/fixtures/vision-fixture.y4m
```

Verify the header with `head -c 80 apps/ui/e2e/fixtures/vision-fixture.y4m` —
expect `YUV4MPEG2 W640 H480 F5:1 Ip A1:1 C420jpeg`.

Note: faces in the downscaled sports scene are small for BlazeFace
(short-range model), so the spec asserts the face-detection loop ran and
rendered a numeric count rather than pinning a face count >= 1; the >= 1-face
assertion belongs to the manual real-webcam hardware sweep.

## `track-fixture.y4m` (+ `track-fixture-source.jpg`)

A real photograph played as Chromium's fake webcam in the
`e2e/blocks/vision-track.spec.ts` **Track lanes**, curated so a SINGLE frame
plausibly triggers all four MediaPipe streaming trackers: a large,
un-occluded, frontal **face** (face landmarker, 478-pt mesh + BlazeFace),
visible **upper body** (pose landmarker, 33-pt), and a clear bare-hand
**thumbs-up** (hand landmarker, 21-pt; gesture recognizer `Thumb_Up`).

- **Source photo**: `track-fixture-source.jpg` — NASA, "ISS-64 Hopkins holiday
  season portrait" (astronaut Michael Hopkins giving a thumbs-up aboard the
  ISS), **public domain** (NASA media usage guidelines), via Wikimedia Commons
  `File:ISS-64 Hopkins holiday season portrait.jpg` (960px rendition). The
  committed source JPEG makes regeneration reproducible offline.
- **Format**: YUV4MPEG2 (uncompressed), 640x480 (person-centered crop +
  aspect-preserving scale + letterbox pad), yuv420p, 5 fps, 2 s (10 frames),
  ~4.4 MB — same envelope as `vision-fixture.y4m`.

### Regenerating

```sh
ffmpeg -y -loop 1 -i apps/ui/e2e/fixtures/track-fixture-source.jpg -t 2 -r 5 \
  -vf "crop=w=440:h=460:x=230:y=180,scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -pix_fmt yuv420p apps/ui/e2e/fixtures/track-fixture.y4m
```

Verify the header with `head -c 80 apps/ui/e2e/fixtures/track-fixture.y4m` —
expect `YUV4MPEG2 W640 H480 F5:1 Ip A1:1 C420jpeg`.

Note: a static photo exercises detection + per-frame processing (liveness,
FPS, landmark counts, gesture category), not motion tracking. Live-motion
behavior (and the real-hardware camera path) is closed by the manual
real-webcam sweep documented in `e2e/blocks/vision.spec.ts` /
`e2e/blocks/vision-track.spec.ts` and the apps/ui README.

## Photo-search fixtures (`photo-search/`)

Six committed images drive `e2e/blocks/photo.spec.ts` (the real-CLIP
Photo block E2E). All are (re)generated deterministically by the
committed script:

```sh
# from apps/ui — needs only a normal pnpm install (@playwright/test devDep)
node e2e/fixtures/generate-photo-search-fixtures.mjs
```

- **`football.jpg`** + **`football-copy.jpg`** — a real football-match
  photograph (the same content as `public/test-assets/portrait.jpg`) and a
  **byte-identical copy** of it (verify: both share one `shasum`). Because the
  copy embeds to the same CLIP vector, their cosine similarity is ~1.0: this is
  the **known exact-duplicate pair** the Duplicates lane asserts groups (exactly
  one group of size 2) at the block's default threshold. The real photo is also
  the strongest text→image signal, so the text-search lane queries
  `"a photo of people playing football"` and asserts a `football*` image ranks
  first, and the image→image lane uploads `football-copy.jpg` and asserts its
  twin ranks first.
- **`apple.png` / `car.png` / `tree.png` / `dog.png`** — four visually distinct
  400×400 scenes (a large color emoji + caption on a distinct background),
  rendered by a Playwright Chromium screenshot of styled HTML (deterministic, no
  extra deps). They are the **distinct photos**: each stays unique in the
  Duplicates lane, and each carries a plausible zero-shot category under the
  Photo label set. The spec pins the probe-confirmed `dog.png → animals` label
  (a real CLIP run against these fixtures), and asserts every fixture received a
  non-empty label from the active set.

**Probe-then-pin**: the ranking + categorization assertions are locked to what a
**real** CLIP run (`Xenova/clip-vit-base-patch32`) actually produces against
these fixtures — the spec logs the full category matrix + ranking table via
`testInfo.attach`, and the pinned values match the observed real behavior (no
loosened assertions). The exact-duplicate pair guarantees the duplicate lane is
deterministic regardless of CLIP's absolute similarity scale.
