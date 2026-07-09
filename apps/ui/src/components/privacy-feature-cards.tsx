import { CircleOff, Lock, Shield, WifiOff, Zap, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Feature {
  icon: LucideIcon;
  stat: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Shield,
    stat: '100%',
    title: 'Private',
    description: 'Zero data leaves device',
  },
  {
    icon: Zap,
    stat: '0ms',
    title: 'Network Latency',
    description: 'After initial model load',
  },
  {
    icon: WifiOff,
    stat: 'Offline',
    title: 'Fully Capable',
    description: 'No internet required',
  },
  {
    icon: Lock,
    stat: 'Secure',
    title: 'Local Storage',
    description: 'Encrypted on-device',
  },
  {
    icon: CircleOff,
    stat: 'Zero',
    title: 'Cost & APIs',
    description: 'No cost, no API keys',
  },
];

/**
 * A calm, token-native row of five privacy/local-first feature cards for the
 * /blocks gallery. Presentational app chrome (not a registry primitive).
 */
export function PrivacyFeatureCards({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {FEATURES.map((feature) => {
        const Icon = feature.icon;
        return (
          <div
            key={feature.title}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-5"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold tabular-nums text-foreground">{feature.stat}</div>
            <div className="text-sm font-semibold text-foreground">{feature.title}</div>
            <div className="text-xs text-muted-foreground">{feature.description}</div>
          </div>
        );
      })}
    </div>
  );
}
