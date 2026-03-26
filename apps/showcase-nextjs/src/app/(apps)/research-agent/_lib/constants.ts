/**
 * @file constants.ts
 * @description Constants for the research agent application
 */

import type { KnowledgeArticle } from './types';

/** Default language model identifier for the agent */
export const MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

/** Approximate model download size */
export const MODEL_SIZE = '1.1GB';

/** Maximum steps the agent can take */
export const MAX_STEPS = 8;

/** Sample research questions for quick start */
export const SAMPLE_QUESTIONS = [
  'What are the main benefits and challenges of quantum computing?',
  'Compare photosynthesis and solar panels for energy conversion.',
  'How does CRISPR gene editing work and what are its applications?',
];

/** Knowledge base articles the search tool can find */
export const KNOWLEDGE_BASE: KnowledgeArticle[] = [
  {
    id: 'qc-1',
    title: 'Introduction to Quantum Computing',
    content: 'Quantum computing uses quantum bits (qubits) that can exist in superposition, representing both 0 and 1 simultaneously. This enables quantum computers to solve certain problems exponentially faster than classical computers. Key concepts include entanglement, where qubits become correlated, and quantum gates that manipulate qubit states. Current quantum computers have 50-1000+ qubits but are error-prone.',
    category: 'quantum-computing',
  },
  {
    id: 'qc-2',
    title: 'Quantum Computing Applications',
    content: 'Quantum computing has promising applications in cryptography (breaking and creating encryption), drug discovery (simulating molecular interactions), optimization problems (logistics, finance), and machine learning (quantum neural networks). Google demonstrated quantum supremacy in 2019, and IBM offers cloud quantum computing services. However, practical quantum advantage for real-world problems remains limited.',
    category: 'quantum-computing',
  },
  {
    id: 'qc-3',
    title: 'Challenges in Quantum Computing',
    content: 'Major challenges include quantum decoherence (qubits losing their quantum state), high error rates requiring error correction, extreme cooling requirements (near absolute zero), and the difficulty of scaling up qubit counts while maintaining coherence. The threshold for useful fault-tolerant quantum computing is estimated at millions of physical qubits.',
    category: 'quantum-computing',
  },
  {
    id: 'bio-1',
    title: 'Photosynthesis Process',
    content: 'Photosynthesis converts sunlight, water, and CO2 into glucose and oxygen. It occurs in chloroplasts using chlorophyll pigments. The light-dependent reactions in the thylakoid membranes capture light energy to produce ATP and NADPH. The Calvin cycle in the stroma uses these to fix CO2 into glucose. Photosynthesis is approximately 3-6% efficient at converting solar energy to chemical energy.',
    category: 'biology',
  },
  {
    id: 'bio-2',
    title: 'Solar Panel Technology',
    content: 'Solar panels use photovoltaic cells made of semiconductor materials (typically silicon) to convert sunlight directly into electricity. Modern panels achieve 20-25% efficiency, with lab records exceeding 47%. Types include monocrystalline (most efficient), polycrystalline (cost-effective), and thin-film (flexible). Solar energy is the fastest-growing renewable energy source globally.',
    category: 'energy',
  },
  {
    id: 'bio-3',
    title: 'CRISPR Gene Editing',
    content: 'CRISPR-Cas9 is a gene editing tool adapted from bacterial immune systems. It uses a guide RNA to direct the Cas9 enzyme to a specific DNA sequence, where it makes a precise cut. The cell\'s repair mechanisms then modify the gene. Applications include treating genetic diseases (sickle cell, muscular dystrophy), creating disease-resistant crops, and studying gene function. Ethical concerns involve germline editing and designer babies.',
    category: 'genetics',
  },
  {
    id: 'bio-4',
    title: 'CRISPR Applications and Ethics',
    content: 'Clinical trials are underway using CRISPR to treat sickle cell disease, certain cancers, and inherited blindness. In agriculture, CRISPR has created drought-resistant crops and disease-resistant livestock. The technology raises ethical questions about human germline editing (changes passed to future generations), equitable access, and potential misuse. The 2018 case of CRISPR-edited babies in China sparked global debate about regulation.',
    category: 'genetics',
  },
  {
    id: 'ai-1',
    title: 'Machine Learning Fundamentals',
    content: 'Machine learning enables computers to learn from data without explicit programming. Supervised learning uses labeled data to learn mappings (classification, regression). Unsupervised learning finds patterns in unlabeled data (clustering, dimensionality reduction). Reinforcement learning trains agents through rewards and penalties. Deep learning uses neural networks with many layers for complex pattern recognition.',
    category: 'artificial-intelligence',
  },
];
