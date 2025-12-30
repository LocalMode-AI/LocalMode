import { LucideIcon } from 'lucide-react';

/**
 * Application categories for filtering and organization
 */
export const CATEGORIES = {
  CHAT: 'AI Chat',
  RAG: 'RAG & Search',
  AUDIO: 'Audio',
  TEXT_NLP: 'Text & NLP',
  VISION: 'Vision',
  PRIVACY: 'Privacy & Security',
} as const;

export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];

/**
 * Application routes
 */
export const ROUTES = {
  HOME: '/',
  LLM_CHAT: '/llm-chat',
  PDF_SEARCH: '/pdf-search',
  VOICE_NOTES: '/voice-notes',
  SENTIMENT_ANALYZER: '/sentiment-analyzer',
  BACKGROUND_REMOVER: '/background-remover',
  SMART_GALLERY: '/smart-gallery',
  DOCUMENT_REDACTOR: '/document-redactor',
  SEMANTIC_SEARCH: '/semantic-search',
  PRODUCT_SEARCH: '/product-search',
  MEETING_ASSISTANT: '/meeting-assistant',
  EMAIL_CLASSIFIER: '/email-classifier',
  IMAGE_CAPTIONER: '/image-captioner',
  TRANSLATOR: '/translator',
  TEXT_SUMMARIZER: '/text-summarizer',
  QA_BOT: '/qa-bot',
  SMART_AUTOCOMPLETE: '/smart-autocomplete',
  OCR_SCANNER: '/ocr-scanner',
  INVOICE_QA: '/invoice-qa',
  OBJECT_DETECTOR: '/object-detector',
  PHOTO_ENHANCER: '/photo-enhancer',
  AUDIOBOOK_CREATOR: '/audiobook-creator',
  DUPLICATE_FINDER: '/duplicate-finder',
  ENCRYPTED_VAULT: '/encrypted-vault',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];

/**
 * Application metadata
 */
export interface AppMetadata {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  category: Category;
  modelSize: string;
  route: RoutePath;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  features: string[];
  models: string[];
  comingSoon?: boolean;
}
