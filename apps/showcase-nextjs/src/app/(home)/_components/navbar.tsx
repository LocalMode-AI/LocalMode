'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Github, CloudOff } from 'lucide-react';
import { useUIStore } from '../_store';
import { Button } from './ui';
import { NetworkStatus } from './network-status';

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const { toggleSidebar } = useUIStore();

  return (
    <div
      className={`navbar border-b border-poster-border/30 h-16 px-4 bg-poster-bg/80 backdrop-blur-md supports-backdrop-filter:bg-poster-bg/60 z-50 ${isHome ? 'sticky top-0' : ''}`}
    >
      <div className="navbar-start w-auto lg:w-1/2">
        {pathname !== '/' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="lg:hidden mr-2 text-poster-text-sub hover:text-poster-text-main hover:bg-white/5"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-linear-to-br from-poster-primary to-poster-primary-dark flex items-center justify-center text-white shadow-lg shadow-poster-primary/20 group-hover:scale-105 transition-transform duration-300 border border-white/10">
            <CloudOff className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold hidden sm:inline-block text-poster-text-main">
            Local<span className="text-poster-primary">Mode</span>.AI
          </span>
        </Link>
      </div>

      <div className="navbar-center hidden lg:flex items-center gap-3">
        <NetworkStatus />
      </div>

      <div className="navbar-end w-auto lg:w-1/2 ml-auto">
        <Link
          href="https://github.com/LocalMode-AI/LocalMode"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-poster-surface/50 border border-poster-border/30 hover:border-poster-primary/50 hover:bg-poster-primary/10 transition-all duration-300 group"
        >
          <Github className="w-4 h-4 text-poster-text-sub/70 group-hover:text-poster-primary transition-colors" />
          <span className="text-sm font-semibold text-poster-text-sub/80">Star on GitHub</span>
        </Link>
      </div>
    </div>
  );
}
