/**
 * @file blocks-catalog.ts
 * @description Growth-ready card data model for the `/blocks` gallery. Keyed by
 * category so a new block adds cards by extending this model — never by editing
 * the grid/section layout.
 *
 * A single-block category keeps the flat `/blocks/<name>` route, so it appears as
 * a single-card category. `devtools-drawer` is deliberately absent — it is
 * layout chrome mounted by `blocks/layout.tsx`, has no `/blocks/<name>` route,
 * and is excluded from `platform.spec.ts` `BLOCK_NAMES`; a card for it would link
 * nowhere. When a category grows (e.g. chat → chat-basic + chat-advanced), the
 * owning category's `blocks` array grows and the gallery renders the extra card
 * with no layout change.
 *
 * Model badges are GROUNDED in each block's real model catalog/constants (read
 * 2026-07-04), not guessed — ranges span a block's smallest default model to its
 * heaviest optional model; `device-model-lab` downloads nothing.
 *
 * Note: the routing module (`category-map.ts`) owns the category→blocks structure
 * for the `/blocks/<category>[/<block>]` routes. This catalog is self-contained;
 * derive one from the other rather than duplicating the membership.
 */
import {
  MessageSquare,
  Library,
  AudioLines,
  Eye,
  ScanEye,
  BookAudio,
  ClipboardList,
  Mic,
  Radio,
  Speech,
  CopyCheck,
  Database,
  FileQuestion,
  MessagesSquare,
  ScanSearch,
  Search,
  Boxes,
  Braces,
  Gauge,
  ListChecks,
  AlignLeft,
  ClipboardCheck,
  SlidersHorizontal,
  Smile,
  Tags,
  TextCursorInput,
  Hand,
  Languages,
  Image as ImageIcon,
  Lock,
  ScanLine,
  Scissors,
  Wand2,
  Cpu,
  Bot,
  PenLine,
  BarChart3,
  Images,
  ImagePlus,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/** One presentational gallery card (one block). */
export interface BlockCardData {
  /** Category id this card belongs to (equals the block slug for flat categories). */
  category: string;
  /** Block slug — the segment after `/blocks/`. */
  slug: string;
  /** Canonical route the card links to. */
  route: string;
  /** Card title. */
  title: string;
  /** Lucide icon component for the card. */
  icon: LucideIcon;
  /** One-line description (kept short so cards stay uniform). */
  description: string;
  /**
   * The full block description shown on the block page (the `BlockShell`
   * `description`). Used by the "Copy page" / "View as Markdown" actions so the
   * markdown matches the page. Falls back to {@link description} when absent.
   */
  pageDescription?: string;
  /** At most 3 short feature chips. */
  chips: string[];
  /** Model-weight badge — a size range for model-backed blocks, or "No download". */
  modelBadge: string;
}

/**
 * Per-category gradient accent, built ONLY from shadcn CSS-variable-backed tokens
 * (`primary`, `accent`, `secondary`, `muted`, `ring`) so it stays fully theme-aware
 * in light and dark and picks up a consumer's re-theme for free. The neutral base
 * palette renders these as tonal washes; a themed consumer gets colored accents.
 */
export interface BlockCategoryAccent {
  /** Faint corner wash layered behind the card body. */
  cardWash: string;
  /** Gradient tint for the icon container. */
  iconWash: string;
}

/** A category section: header (icon + title + count) over a grid of cards. */
export interface BlockCategory {
  /** Category id. */
  id: string;
  /** Section header title. */
  title: string;
  /** Section header icon. */
  icon: LucideIcon;
  /** Theme-aware gradient accent applied to this category's cards. */
  accent: BlockCategoryAccent;
  /** Cards in this category. */
  blocks: BlockCardData[];
}

/**
 * The gallery catalog. This is the single source for the gallery's card list;
 * the page derives its sections and grids from it. Model badges are grounded per
 * block (see per-entry notes below):
 *
 * - chat — 4-provider catalog (transformers + webllm + wllama + litert). Default
 *   `granite-4.0-350m-ONNX-web` (~120 MB); webllm/wllama tiers reach ~8B (~5 GB).
 * - knowledge-base — bge-small (~33 MB) → LightOnOCR-2-1B (~1 GB); + granite,
 *   rerankers, DistilBERT-SQuAD, Donut, TrOCR, GLM-OCR.
 * - audio-studio — bge-small (~34 MB) → Moonshine Base (~237 MB); + Whisper Tiny
 *   (~40 MB), Kokoro (~86 MB), DistilBART (~200 MB), Granite (~120 MB), Silero.
 * - vision-lab — MediaPipe landmarkers (~4 MB) + YAMNet (~15 MB) → DETR ResNet-50
 *   (~170 MB); + text embedder / language detector.
 * - device-model-lab — reads browser APIs + ~4 KB HTTP Range GGUF metadata only;
 *   no model bytes ever downloaded.
 * - agent-structured-data — WebGPU-only WebLLM; default Qwen3-1.7B (1.1 GB),
 *   curated medium/large tiers reach ~8B (~5 GB).
 * - writing-tools — Chrome Built-in AI (0 MB when available) else Transformers.js
 *   fallback: Opus-MT pairs (~78 MB) / ModernBERT / DistilBART / Llama-3.2-1B.
 * - text-insights — all-MiniLM (~23 MB) / bge-small (~33 MB) / DistilBERT SST-2
 *   (~67 MB) / MobileBERT-MNLI (~100 MB).
 * - photo-search — CLIP ViT-B/32 (~150 MB) default, SigLIP base (~400 MB) alt.
 * - image-studio — SegFormer-b0 (~15 MB) → ViT-GPT2 (~250 MB); + Swin2SR x2/x4/rw.
 * - privacy-vault — all-MiniLM (~23 MB) + bert-base-NER (~110 MB).
 */
export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: 'chat',
    title: 'Chat',
    icon: MessageSquare,
    accent: { cardWash: 'from-primary/18 to-transparent', iconWash: 'from-primary/25 to-primary/5' },
    blocks: [
      {
        category: 'chat',
        slug: 'chat',
        route: '/blocks/chat',
        title: 'Chat',
        icon: MessageSquare,
        description:
          'Chat with AI models running fully in your browser.',
        pageDescription: 'Chat with AI models that run entirely in your browser. Choose from dozens of models or load your own, attach images for models that can see, and switch on agent mode to let it use tools. Nothing leaves your device, and no model downloads until you pick one.',
        chips: ['4 providers', 'Vision + reasoning', 'Agent mode'],
        modelBadge: '~120 MB - 5 GB',
      },
    ],
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    icon: Library,
    accent: { cardWash: 'from-primary/18 to-transparent', iconWash: 'from-primary/28 to-primary/5' },
    blocks: [
      {
        category: 'knowledge',
        slug: 'semantic-search',
        route: '/blocks/knowledge/semantic-search',
        title: 'Semantic Search',
        icon: Search,
        description:
          'Search your text, PDFs, and scans by meaning.',
        pageDescription: 'Build a searchable knowledge base right in your browser. Add content three ways: paste text, upload PDFs, or scan images with OCR. Then search by meaning instead of exact keywords, with the most relevant passages ranked to the top. Everything runs on your device, and nothing downloads until you start.',
        chips: ['Rerank cross-encoders', 'PDF + OCR ingest', 'Core ⇄ LangChain'],
        modelBadge: '~34 MB - 700 MB',
      },
      {
        category: 'knowledge',
        slug: 'document-qa',
        route: '/blocks/knowledge/document-qa',
        title: 'Document QA',
        icon: FileQuestion,
        description:
          'Ask questions and get answers from your documents.',
        pageDescription: 'Ask questions about your own documents and get direct answers, all on your device. It pulls each answer straight from your text and shows how confident it is. You can also ask about an uploaded image, like an invoice or a scanned page. Nothing downloads until you start.',
        chips: ['DistilBERT-SQuAD', 'Donut DocVQA', 'Confidence tiers'],
        modelBadge: '~34 MB - 800 MB',
      },
      {
        category: 'knowledge',
        slug: 'rag-chat',
        route: '/blocks/knowledge/rag-chat',
        title: 'RAG Chat',
        icon: MessagesSquare,
        description:
          'Chat with your documents, with cited, grounded answers.',
        pageDescription: 'Chat with your own documents and get answers grounded in what you added. Paste text or drop in PDFs, then ask a question and watch the reply stream in. Each answer links back to the exact sources and pages it came from, so you can check the facts. Nothing downloads until you start.',
        chips: ['Streaming RAG', 'Inline citations', 'Granite 4.0 350M'],
        modelBadge: '~34 MB - 250 MB',
      },
      {
        category: 'knowledge',
        slug: 'vector-data-manager',
        route: '/blocks/knowledge/vector-data-manager',
        title: 'Vector Data Manager',
        icon: Database,
        description:
          'Import, export, and inspect your vector database.',
        pageDescription: 'Manage the data behind your knowledge base. Import vectors from formats like Pinecone, ChromaDB, CSV, or JSON, preview them, then export your data back out whenever you want. Keep an eye on storage use and re-index when your embedding model changes. Nothing downloads until you start.',
        chips: ['4-format import', 'Native export', 'Drift + reindex'],
        modelBadge: '~34 MB',
      },
    ],
  },
  {
    id: 'vision',
    title: 'Vision',
    icon: Eye,
    accent: { cardWash: 'from-primary/18 to-transparent', iconWash: 'from-primary/28 to-primary/5' },
    blocks: [
      {
        category: 'vision',
        slug: 'object-detector',
        route: '/blocks/vision/object-detector',
        title: 'Object Detector',
        icon: ScanEye,
        description:
          'Find and label objects in a photo or webcam frame.',
        pageDescription: 'Find and label objects in a photo, drawing a colored box around each one with its name and confidence. Use an uploaded image, the built-in sample, or a still from your webcam, plus a live camera mode that tracks faces in real time. Everything runs in your browser, and the camera asks permission before it starts.',
        chips: ['DETR ResNet-50', 'BlazeFace loop', 'Webcam capture'],
        modelBadge: '~1 MB - 170 MB',
      },
      {
        category: 'vision',
        slug: 'live-tracker',
        route: '/blocks/vision/live-tracker',
        title: 'Live Tracker',
        icon: Hand,
        description:
          'Track hands, pose, face, and gestures from your webcam.',
        pageDescription: 'Track your body in real time through the webcam. Pick from four live modes: hand skeletons, full-body pose, a detailed face mesh with expressions, and hand-gesture recognition, all drawn on the video with a live frame rate. Everything runs in your browser, and the camera asks permission before it starts.',
        chips: ['Hand / Pose / Face', 'Gesture recognition', 'Real-time FPS'],
        modelBadge: '~4 MB - 15 MB',
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio',
    icon: AudioLines,
    accent: { cardWash: 'from-ring/25 to-transparent', iconWash: 'from-ring/35 to-ring/5' },
    blocks: [
      {
        category: 'audio',
        slug: 'voice-notes',
        route: '/blocks/audio/voice-notes',
        title: 'Voice Notes',
        icon: Mic,
        description:
          'Record audio and turn it into searchable text notes.',
        pageDescription: 'Record or upload audio and get a text transcript back. Save transcripts as notes, replay them word by word in sync with the audio, and search your notes by meaning. Runs entirely in your browser; nothing downloads until you transcribe, upload, or search.',
        chips: ['Whisper + Moonshine', 'Synced replay', 'Note search'],
        modelBadge: '~34 MB - 237 MB',
      },
      {
        category: 'audio',
        slug: 'live-transcription',
        route: '/blocks/audio/live-transcription',
        title: 'Live Transcription',
        icon: Radio,
        description:
          'Transcribe your microphone live as you speak.',
        pageDescription: 'Turn on your microphone and watch your speech become text in real time. Includes a hands-free assistant that listens, thinks, and speaks back, with barge-in so you can interrupt. All runs on-device; stopping releases the microphone, and nothing downloads until you start a session.',
        chips: ['Streaming STT', 'Energy / Silero VAD', 'Turn-taking'],
        modelBadge: '~2 MB - 237 MB',
      },
      {
        category: 'audio',
        slug: 'meeting-assistant',
        route: '/blocks/audio/meeting-assistant',
        title: 'Meeting Assistant',
        icon: ClipboardList,
        description:
          'Turn a meeting into a summary and action items.',
        pageDescription: 'Upload meeting audio or paste a transcript, then get a short summary and a checklist of action items with priorities. Tick items off as you go, track progress, and export everything to a text file. Runs entirely in your browser; nothing downloads until you process a meeting.',
        chips: ['3-step pipeline', 'DistilBART + Granite', '.txt export'],
        modelBadge: '~40 MB - 237 MB',
      },
      {
        category: 'audio',
        slug: 'voice-explorer',
        route: '/blocks/audio/voice-explorer',
        title: 'Voice Explorer',
        icon: Speech,
        description:
          'Browse and compare 29 natural text-to-speech voices.',
        pageDescription: 'Browse and preview 29 text-to-speech voices grouped by language. Type any text, hear each voice read it, and play two side by side to compare. Everything runs on-device; the voice model (~86MB) downloads only on the first preview or comparison.',
        chips: ['29 Kokoro voices', 'Preview', 'A/B compare'],
        modelBadge: '~86 MB',
      },
      {
        category: 'audio',
        slug: 'audiobook-reader',
        route: '/blocks/audio/audiobook-reader',
        title: 'Audiobook Reader',
        icon: BookAudio,
        description:
          'Turn long text into speech that plays as it streams.',
        pageDescription: 'Paste long text and have it read aloud, with playback starting before the whole thing finishes. Adjust the reading speed, pause, resume, or stop anytime, and download the result as an audio file. All runs on-device (up to 10,000 characters); the voice model downloads only on the first play.',
        chips: ['Streaming TTS', 'Pause / resume', 'WAV download'],
        modelBadge: '~86 MB',
      },
      {
        category: 'audio',
        slug: 'audio-classifier',
        route: '/blocks/audio/audio-classifier',
        title: 'Audio Classifier',
        icon: AudioLines,
        description:
          'Identify the sounds in a recording or audio file.',
        pageDescription: 'Record a sound or upload an audio file and see what it is, from music and speech to everyday noises. Results come back as a ranked list of the most likely sounds, with the top guess highlighted. Runs entirely in your browser; the model downloads only when you record or choose a file.',
        chips: ['YAMNet', '521 categories', 'Mic or file'],
        modelBadge: '~15 MB',
      },
    ],
  },
  {
    id: 'text',
    title: 'Text',
    icon: Languages,
    accent: { cardWash: 'from-accent/65 to-transparent', iconWash: 'from-accent/80 to-accent/20' },
    blocks: [
      {
        category: 'text',
        slug: 'language-detector',
        route: '/blocks/text/language-detector',
        title: 'Language Detector',
        icon: Languages,
        description:
          'Detect the language of a text and compare two.',
        pageDescription: 'Detect what language a piece of text is written in as you type, showing the most likely languages and how confident each guess is. You can also paste two texts and see how close they are in meaning. It all runs in your browser, and models load only when you start typing or press Compare.',
        chips: ['110 languages', 'Auto-detect', 'Text similarity'],
        modelBadge: '~7 MB',
      },
    ],
  },
  {
    id: 'device',
    title: 'Device',
    icon: Cpu,
    accent: { cardWash: 'from-secondary/75 to-transparent', iconWash: 'from-secondary/90 to-secondary/30' },
    blocks: [
      {
        category: 'device',
        slug: 'device-report',
        route: '/blocks/device/device-report',
        title: 'Device Report',
        icon: Gauge,
        description:
          'See what your device can do for on-device AI.',
        pageDescription: 'See what your device and browser can do for on-device AI. It checks your hardware, browser features, and free storage, then tells you whether a small AI model will run here. Nothing is downloaded.',
        chips: ['Capability report', 'Storage + readiness', 'Adaptive batch'],
        modelBadge: 'No download',
      },
      {
        category: 'device',
        slug: 'model-advisor',
        route: '/blocks/device/model-advisor',
        title: 'Model Advisor',
        icon: ListChecks,
        description:
          'Get model picks matched to your device and task.',
        pageDescription: 'Find the best on-device model for a task on your hardware. Pick a task to get a ranked list of models that fit your device, compare any two side by side, and add your own model to the list. Nothing is downloaded.',
        chips: ['21 tasks', 'Compare + register', 'Ranked models'],
        modelBadge: 'No download',
      },
      {
        category: 'device',
        slug: 'gguf-explorer',
        route: '/blocks/device/gguf-explorer',
        title: 'GGUF Explorer',
        icon: Boxes,
        description:
          'Browse thousands of downloadable AI models.',
        pageDescription: 'Search over 160,000 GGUF models on HuggingFace and peek inside any file to see its size, details, and whether it will run in your browser. Send a model straight to the chat block when you find one you like. No model download required.',
        chips: ['160K+ GGUF', '~4KB Range read', 'Chat handoff'],
        modelBadge: 'No download',
      },
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    icon: Bot,
    accent: { cardWash: 'from-primary/18 to-transparent', iconWash: 'from-primary/28 to-primary/5' },
    blocks: [
      {
        category: 'agents',
        slug: 'research-agent',
        route: '/blocks/agents/research-agent',
        title: 'Research Agent',
        icon: Bot,
        description:
          'Watch an AI agent research a question using tools.',
        pageDescription: 'An agent that answers a question by using tools step by step, pausing for your approval before each tool runs so you stay in control. A timeline shows every step it took. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
        chips: ['ReAct loop', 'Approval gate', '3 tools'],
        modelBadge: '1.1 GB - 5 GB',
      },
      {
        category: 'agents',
        slug: 'data-extractor',
        route: '/blocks/agents/data-extractor',
        title: 'Data Extractor',
        icon: Braces,
        description:
          'Pull structured data from text into a table and chart.',
        pageDescription: 'Pull structured data out of free text using ready-made templates, with automatic retries when the output does not fit. See the result as a sortable table and a chart built from the numbers it found. It runs its own AI model in the browser and needs a graphics-capable device, and nothing downloads until you load it.',
        chips: ['5 zod templates', 'Retry/self-correct', 'Artifacts'],
        modelBadge: '1.1 GB - 5 GB',
      },
    ],
  },
  {
    id: 'writing-tools',
    title: 'Writing Tools',
    icon: PenLine,
    accent: { cardWash: 'from-accent/65 to-transparent', iconWash: 'from-accent/80 to-accent/20' },
    blocks: [
      {
        category: 'writing-tools',
        slug: 'write',
        route: '/blocks/writing-tools/write',
        title: 'Write',
        icon: PenLine,
        description:
          'Rewrite or improve your draft and review the edits.',
        pageDescription: 'Rewrite or improve a draft with an AI edit you review as a before/after diff, then accept or reject it. Use quick presets or write your own instructions, with a live word count. It uses your browser\'s built-in AI when available, or a small downloadable model otherwise, and nothing downloads until you ask.',
        chips: ['AI edits', 'Diff review', 'Chrome AI + fallback'],
        modelBadge: 'Chrome AI or ~380 MB',
      },
      {
        category: 'writing-tools',
        slug: 'translate',
        route: '/blocks/writing-tools/translate',
        title: 'Translate',
        icon: Languages,
        description:
          'Translate text between languages, fully offline.',
        pageDescription: 'Translate text between 24 language pairs, swap the direction with one click to carry the result back into the input, and copy or clear as you go. It uses your browser\'s built-in translator when available, or a downloadable model otherwise. Nothing downloads until you ask.',
        chips: ['24 offline pairs', 'Swap + copy', 'Chrome AI + fallback'],
        modelBadge: 'Chrome AI or ~80 MB',
      },
      {
        category: 'writing-tools',
        slug: 'summarize',
        route: '/blocks/writing-tools/summarize',
        title: 'Summarize',
        icon: AlignLeft,
        description:
          'Summarize long text at the length you choose.',
        pageDescription: 'Turn long text into a shorter summary, choosing a short, medium, or long length and either a pulled-from-the-text or reworded style. See how much you shortened it and the reading time saved. It uses your browser\'s built-in summarizer when available, or a downloadable model otherwise, and nothing downloads until you ask.',
        chips: ['Extractive + abstractive', 'Length presets', 'Compression stats'],
        modelBadge: 'Chrome AI or ~120 MB',
      },
      {
        category: 'writing-tools',
        slug: 'complete',
        route: '/blocks/writing-tools/complete',
        title: 'Complete',
        icon: TextCursorInput,
        description:
          'Predict the next word and autocomplete your text.',
        pageDescription: 'Fill in a blank word in your sentence with the top suggestions ranked by likelihood, then click one to apply it and keep going. Runs entirely in your browser, and nothing downloads until you ask.',
        chips: ['ModernBERT fill-mask', 'Top-5 + apply', 'Transformers.js'],
        modelBadge: '~150 MB',
      },
    ],
  },
  {
    id: 'text-insights',
    title: 'Text Insights',
    icon: BarChart3,
    accent: { cardWash: 'from-ring/25 to-transparent', iconWash: 'from-ring/35 to-ring/5' },
    blocks: [
      {
        category: 'text-insights',
        slug: 'sentiment-analyzer',
        route: '/blocks/text-insights/sentiment-analyzer',
        title: 'Sentiment Analyzer',
        icon: Smile,
        description:
          'Score text as positive or negative, one or in bulk.',
        pageDescription: 'Score text as positive or negative, one message at a time or thousands at once. Watch live progress and speed, see the running positive and negative totals, and browse results in a scrollable list. The model loads only when you press Run.',
        chips: ['Batch sentiment', 'Throughput', 'Windowed results'],
        modelBadge: '~67 MB',
      },
      {
        category: 'text-insights',
        slug: 'text-classifier',
        route: '/blocks/text-insights/text-classifier',
        title: 'Text Classifier',
        icon: Tags,
        description:
          'Sort text into your own labels, no training needed.',
        pageDescription: 'Sort any message into your own set of labels. Add or remove categories, then see which label wins and how every other label ranked. The model loads only when you press Run.',
        chips: ['Zero-shot', 'Custom labels', 'Ranked scores'],
        modelBadge: '~25 MB',
      },
      {
        category: 'text-insights',
        slug: 'model-evaluator',
        route: '/blocks/text-insights/model-evaluator',
        title: 'Model Evaluator',
        icon: ClipboardCheck,
        description:
          'Measure classifier accuracy on labeled data.',
        pageDescription: 'Measure how accurate a text classifier is on a labeled set. Get accuracy along with precision, recall, and F1, a color-coded confusion matrix, and one-click JSON export of the results. The model loads only when you press Run.',
        chips: ['P/R/F1 + matrix', 'Labeled datasets', 'JSON export'],
        modelBadge: '~67 MB - 400 MB',
      },
      {
        category: 'text-insights',
        slug: 'threshold-calibrator',
        route: '/blocks/text-insights/threshold-calibrator',
        title: 'Threshold Calibrator',
        icon: SlidersHorizontal,
        description:
          'Pick the right similarity cutoff from your data.',
        pageDescription: 'Pick a good similarity cutoff straight from your own examples instead of guessing. See the value it suggests next to the built-in default, along with a view of how your scores are distributed. The model loads only when you press Calibrate.',
        chips: ['Percentile calibration', 'Preset compare', 'Distribution'],
        modelBadge: '~23 MB - 33 MB',
      },
    ],
  },
  {
    id: 'photo',
    title: 'Photo',
    icon: Images,
    accent: { cardWash: 'from-accent/65 to-transparent', iconWash: 'from-accent/80 to-accent/20' },
    blocks: [
      {
        category: 'photo',
        slug: 'smart-gallery',
        route: '/blocks/photo/smart-gallery',
        title: 'Smart Gallery',
        icon: Images,
        description:
          'Auto-sort your photos into categories on device.',
        pageDescription: 'Build a photo library right in your browser that tags every image automatically as you add it. Browse it as a grid or list with filename, category, confidence, and how many similar photos it found, and delete, clear, or cancel at any time. Nothing downloads until you load a model.',
        chips: ['Adaptive batching', 'Zero-shot categories', 'CLIP ViT-B/32'],
        modelBadge: '~350 MB',
      },
      {
        category: 'photo',
        slug: 'image-search',
        route: '/blocks/photo/image-search',
        title: 'Image Search',
        icon: ScanSearch,
        description:
          'Search your photos by text or by another image.',
        pageDescription: 'Search a photo library on your device by typing what you are looking for, or by dropping in a reference image. Both search the same photos, with a control for how many results to show and a minimum match threshold. Nothing downloads until you load a model.',
        chips: ['Text → image', 'Image → image', 'One vector space'],
        modelBadge: '~350 MB',
      },
      {
        category: 'photo',
        slug: 'duplicate-finder',
        route: '/blocks/photo/duplicate-finder',
        title: 'Duplicate Finder',
        icon: CopyCheck,
        description:
          'Find and remove near-duplicate photos in your library.',
        pageDescription: 'Load a photo library on your device, then find and group near-duplicate images. Tune how close a match has to be with quick presets, review each group\'s average similarity, and bulk-delete the extras while keeping the first of each group. Nothing downloads until you load a model.',
        chips: ['Union-find', 'Threshold presets', 'Keep-first delete'],
        modelBadge: '~350 MB',
      },
      {
        category: 'photo',
        slug: 'photo-categorizer',
        route: '/blocks/photo/photo-categorizer',
        title: 'Photo Categorizer',
        icon: Tags,
        description:
          'Sort your photos into labels you define.',
        pageDescription: 'Add photos to a browser library where each one is sorted into a category as it loads. Edit the label list, re-sort the whole library at once, and filter down to any single category. Nothing downloads until you load a model.',
        chips: ['Editable labels', 'Re-categorize', 'Faceted filter'],
        modelBadge: '~350 MB',
      },
    ],
  },
  {
    id: 'image-studio',
    title: 'Image Studio',
    icon: ImagePlus,
    accent: { cardWash: 'from-accent/65 to-transparent', iconWash: 'from-accent/80 to-accent/20' },
    blocks: [
      {
        category: 'image-studio',
        slug: 'background-remover',
        route: '/blocks/image-studio/background-remover',
        title: 'Background Remover',
        icon: Scissors,
        description:
          'Cut out a photo subject to a transparent PNG.',
        pageDescription: 'Remove the background from a photo and get a clean, transparent PNG you can download. It automatically finds the main subject, cuts it out, and shows the result next to the original on a checkerboard. Everything runs in your browser, and nothing downloads until you drop in an image.',
        chips: ['SegFormer', 'Transparent PNG', 'Best-mask alpha'],
        modelBadge: '~15 MB',
      },
      {
        category: 'image-studio',
        slug: 'image-enhancer',
        route: '/blocks/image-studio/image-enhancer',
        title: 'Image Enhancer',
        icon: Wand2,
        description:
          'Upscale and sharpen a photo at 2x, 4x, or restore.',
        pageDescription: 'Upscale and sharpen photos to make them larger and clearer. Choose a fast 2x mode, a higher-quality 4x mode, or a restore mode for real-world low-quality images, then compare before and after and download the result. Everything runs in your browser, and nothing downloads until you drop in an image.',
        chips: ['Swin2SR', '2x / 4x / Restore', 'Exact upscale'],
        modelBadge: '~45 MB / mode',
      },
      {
        category: 'image-studio',
        slug: 'image-captioner',
        route: '/blocks/image-studio/image-captioner',
        title: 'Image Captioner',
        icon: ImageIcon,
        description:
          'Generate alt-text captions for your images.',
        pageDescription: 'Automatically write a short description (alt-text) for any image. Drop in JPEG, PNG, WebP, or GIF files up to 10MB and your captions build up in a gallery you can copy from, remove single items, or clear all at once. Everything runs in your browser, and nothing downloads until you add your first image.',
        chips: ['ViT-GPT2', 'Alt-text', 'Gallery'],
        modelBadge: '~230 MB',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    icon: ShieldCheck,
    accent: { cardWash: 'from-secondary/75 to-transparent', iconWash: 'from-secondary/90 to-secondary/30' },
    blocks: [
      {
        category: 'privacy',
        slug: 'pii-redactor',
        route: '/blocks/privacy/pii-redactor',
        title: 'PII Redactor',
        icon: ScanLine,
        description:
          'Find and mask personal details in text, on device.',
        pageDescription: 'Find and hide personal details in text, such as names, emails, phone numbers, and card numbers. It detects sensitive info, replaces it with labeled placeholders you can toggle by type, and lets you copy or export the cleaned text. Everything runs in your browser, and models load only when you press Scan.',
        chips: ['bert-base-NER', 'Redaction', 'Differential privacy'],
        modelBadge: '~23 MB - 110 MB',
      },
      {
        category: 'privacy',
        slug: 'encrypted-vault',
        route: '/blocks/privacy/encrypted-vault',
        title: 'Encrypted Vault',
        icon: Lock,
        description:
          'A passphrase-locked vault for encrypted notes and files.',
        pageDescription: 'Keep private notes and documents in a vault locked by a passphrase you choose. Everything is encrypted before it is saved, decrypted only when you view it, stays locked after a reload, and keeps a tamper-evident history you can verify and export. Everything runs in your browser using built-in encryption, and nothing downloads.',
        chips: ['AES-GCM', 'Audit log', 'Web Crypto'],
        modelBadge: 'No download',
      },
    ],
  },
];

/**
 * Flat card list across every category — the single source the gallery iterates
 * when it needs all cards regardless of grouping.
 */
export const BLOCK_CARDS: BlockCardData[] = BLOCK_CATEGORIES.flatMap((c) => c.blocks);
