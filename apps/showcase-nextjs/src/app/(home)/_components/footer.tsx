import Link from 'next/link';
import {
  Github,
  ExternalLink,
  Zap,
  Code2,
  BookOpen,
  Shield,
  Lock,
  WifiOff,
  Coins,
  CloudOff,
} from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-poster-border/30 bg-poster-surface/20 backdrop-blur-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12 mb-12">
          {/* Brand Section */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-poster-primary to-poster-primary-dark flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-poster-primary/20 border border-white/10">
                <CloudOff className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black tracking-tight text-poster-text-main">
                  Local<span className="text-poster-primary">Mode</span>.AI
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-poster-text-sub/50">
                  Local-First AI Toolkit
                </span>
              </div>
            </div>
            <p className="text-sm text-poster-text-sub/60 mb-6 leading-relaxed max-w-md">
              Local-first AI toolkit for the modern web.
              <br />
              Build privacy-first AI applications that work entirely in the browser.
            </p>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 cursor-default transition-colors hover:text-poster-primary group">
                <Shield className="w-4 h-4 text-poster-primary" />
                <span className="font-semibold text-poster-text-sub/80 group-hover:text-poster-primary transition-colors">
                  Private
                </span>
              </span>
              <span className="text-poster-text-sub/40">•</span>
              <span className="inline-flex items-center gap-1 cursor-default transition-colors hover:text-poster-accent-teal group">
                <Zap className="w-4 h-4 text-poster-accent-teal" />
                <span className="font-semibold text-poster-text-sub/80 group-hover:text-poster-accent-teal transition-colors">
                  Fast
                </span>
              </span>
              <span className="text-poster-text-sub/40">•</span>
              <span className="inline-flex items-center gap-1 cursor-default transition-colors hover:text-poster-accent-purple group">
                <WifiOff className="w-4 h-4 text-poster-accent-purple" />
                <span className="font-semibold text-poster-text-sub/80 group-hover:text-poster-accent-purple transition-colors">
                  Offline
                </span>
              </span>
              <span className="text-poster-text-sub/40">•</span>
              <span className="inline-flex items-center gap-1 cursor-default transition-colors hover:text-poster-accent-orange group">
                <Lock className="w-4 h-4 text-poster-accent-orange" />
                <span className="font-semibold text-poster-text-sub/80 group-hover:text-poster-accent-orange transition-colors">
                  Secure
                </span>
              </span>
              <span className="text-poster-text-sub/40">•</span>
              <span className="inline-flex items-center gap-1 cursor-default transition-colors hover:text-poster-accent-pink group">
                <Coins className="w-4 h-4 text-poster-accent-pink" />
                <span className="font-semibold text-poster-text-sub/80 group-hover:text-poster-accent-pink transition-colors">
                  No Cost
                </span>
              </span>
              <span className="text-poster-text-sub/40">•</span>
              <span className="inline-flex items-center gap-1 cursor-default transition-colors hover:text-poster-primary-dark group">
                <CloudOff className="w-4 h-4 text-poster-primary-dark" />
                <span className="font-semibold text-poster-text-sub/80 group-hover:text-poster-primary-dark transition-colors">
                  No APIs
                </span>
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-poster-text-main mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="https://github.com/LocalMode-AI/LocalMode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-poster-text-sub/70 hover:text-poster-primary transition-colors group"
                >
                  <Github className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>GitHub Repository</span>
                  <ExternalLink className="w-3.5 h-3.5 text-poster-text-sub/30 group-hover:text-poster-primary/50 transition-colors" />
                </Link>
              </li>
              <li>
                <Link
                  href="https://localmode.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-poster-text-sub/70 hover:text-poster-primary transition-colors group"
                >
                  <BookOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Documentation</span>
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/LocalMode-AI/LocalMode/tree/main/apps/showcase-nextjs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-poster-text-sub/70 hover:text-poster-primary transition-colors group"
                >
                  <Code2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Code Examples</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
