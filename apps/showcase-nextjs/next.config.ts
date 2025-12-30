import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'zustand'],
  },
  // Turbopack configuration (Next.js 16+)
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  // Enable static exports for deployment
  output: 'standalone',
};

export default nextConfig;
