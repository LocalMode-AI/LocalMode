import Link from 'next/link';
import { ExternalLink, Code, Clock } from 'lucide-react';
import { AppMetadata } from '../_lib/types';
import { Card, CardBody, CardTitle, Button } from './ui';

interface AppCardProps {
  app: AppMetadata;
}

export function AppCard({ app }: AppCardProps) {
  const Icon = app.icon;

  return (
    <Card
      className={`group relative overflow-hidden rounded-xl border border-poster-border/30 bg-poster-surface/50 p-4 transition-all duration-300 ${app.comingSoon ? 'opacity-75' : 'hover:bg-poster-surface hover:shadow-xl hover:shadow-black/50'}`}
    >
      {/* Full card clickable link overlay for released apps */}
      {!app.comingSoon && (
        <Link href={app.route} className="absolute inset-0 z-0" aria-label={`Open ${app.title}`} />
      )}

      <CardBody className="flex h-full flex-col gap-3 p-0">
        {/* Header: Icon, Title, Badge */}
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/10 transition-colors ${app.comingSoon ? 'bg-poster-surface-lighter/30 text-poster-text-sub/50' : 'bg-poster-surface-lighter/50 text-poster-primary group-hover:bg-poster-primary/20 group-hover:text-poster-primary'}`}
          >
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <CardTitle
                className={`line-clamp-1 text-base font-semibold transition-colors ${app.comingSoon ? 'text-poster-text-main/70' : 'text-poster-text-main group-hover:text-poster-primary'}`}
              >
                {app.title}
              </CardTitle>
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          className={`line-clamp-2 min-h-10 text-xs leading-relaxed ${app.comingSoon ? 'text-poster-text-sub/50' : 'text-poster-text-sub/70'}`}
        >
          {app.description}
        </p>

        {/* Features & Model Info */}
        <div className="mt-auto space-y-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {app.features.map((feature) => (
              <span
                key={feature}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] ${app.comingSoon ? 'border-white/3 bg-white/3 text-poster-text-sub/40' : 'border-white/5 bg-white/5 text-poster-text-sub/60'}`}
              >
                {feature}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3">
            <div className="font-mono text-[10px] text-poster-text-sub/50">{app.modelSize}</div>

            {/* Only show buttons for released apps */}
            {!app.comingSoon && (
              <div className="flex gap-2 z-10">
                <Link
                  href={`https://github.com/LocalMode-AI/LocalMode/tree/main/apps/showcase-nextjs/src/app/(apps)/${app.id}`}
                  target="_blank"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7.5 min-h-0 px-3 text-poster-text-sub/60 hover:bg-white/10 hover:text-poster-text-main border border-white/10 rounded-lg gap-1.5"
                  >
                    <Code className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Code</span>
                  </Button>
                </Link>
                <Link href={app.route}>
                  <Button className="h-7.5 min-h-0 bg-poster-primary px-4 text-xs font-semibold text-white hover:bg-poster-primary/75 border-none rounded-lg shadow-lg shadow-poster-primary/20">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Try Demo
                  </Button>
                </Link>
              </div>
            )}

            {/* Coming Soon Badge */}
            {app.comingSoon && (
              <div className="opacity-70 flex items-center gap-1.5 rounded-full bg-poster-primary/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-poster-primary border border-poster-primary/30">
                <Clock className="h-3 w-3 opacity-70" />
                Coming Soon
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
