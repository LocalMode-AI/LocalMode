/**
 * @file _demo/index.ts
 * @description Demo module - constants and components for the demo feature
 */

export { DemoButton } from './demo-button';
export { DemoSuggestions } from './demo-suggestions';

/** Demo document filename for identification */
export const DEMO_FILENAME = 'AI-ML-Guide.pdf';

/** Path to the demo PDF file in public folder */
export const DEMO_PDF_PATH = '/demo/AI-ML-Guide.pdf';

/** Sample suggested questions for the demo */
export const DEMO_QUESTIONS = [
  'What is machine learning?',
  'Explain supervised vs unsupervised learning',
  'What are neural networks?',
  'How is AI used in healthcare?',
  'What are the ethical concerns in AI?',
] as const;

/**
 * Check if a document is the demo document
 */
export function isDemoDocument(filename: string): boolean {
  return filename === DEMO_FILENAME;
}

/**
 * Load the demo PDF file and return it as a File object
 */
export async function loadDemoPDF(): Promise<File> {
  const response = await fetch(DEMO_PDF_PATH);
  if (!response.ok) {
    throw new Error('Failed to load demo PDF');
  }
  const blob = await response.blob();
  return new File([blob], DEMO_FILENAME, { type: 'application/pdf' });
}
