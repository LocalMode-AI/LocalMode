/**
 * @file photo-grid.tsx
 * @description Photo grid component for displaying photos with optional similarity scores
 */
'use client';

import { Trash2, ImageIcon } from 'lucide-react';
import { Spinner } from './ui';
import { cn, formatScore, getScoreColor } from '../_lib/utils';
import type { Photo, SearchResult } from '../_lib/types';

// ============================================================================
// PhotoGrid - Grid of photo cards
// ============================================================================

/** Props for the PhotoGrid component */
interface PhotoGridProps {
  /** Photos to display (no scores) */
  photos?: Photo[];
  /** Search results to display (with scores) */
  results?: SearchResult[];
  /** Callback when a photo is deleted */
  onDelete: (id: string) => void;
  /** Optional empty state message */
  emptyMessage?: string;
}

/** Responsive photo grid with similarity score badges */
export function PhotoGrid({ photos, results, onDelete, emptyMessage }: PhotoGridProps) {
  const items = results
    ? results.map((r) => ({ photo: r.photo, score: r.score }))
    : (photos ?? []).map((p) => ({ photo: p, score: undefined }));

  if (items.length === 0 && emptyMessage) {
    return (
      <div className="text-center py-10 text-poster-text-sub/40 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((item, index) => (
        <PhotoCard
          key={item.photo.id}
          photo={item.photo}
          score={item.score}
          index={index}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ============================================================================
// PhotoCard - Individual photo card
// ============================================================================

/** Props for the PhotoCard component */
interface PhotoCardProps {
  /** The photo to display */
  photo: Photo;
  /** Optional similarity score */
  score?: number;
  /** Animation index */
  index: number;
  /** Delete callback */
  onDelete: (id: string) => void;
}

/** Photo card with hover overlay, score badge, and delete action */
function PhotoCard({ photo, score, index, onDelete }: PhotoCardProps) {
  return (
    <div
      className={cn(
        'group relative aspect-square rounded-xl overflow-hidden border border-poster-border/20',
        'hover:border-poster-primary/30 hover:shadow-lg hover:shadow-poster-primary/5',
        'transition-all duration-300 animate-in fade-in'
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      {/* Photo image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.dataUrl}
        alt={photo.fileName}
        className={cn(
          'w-full h-full object-cover transition-all duration-300',
          photo.isProcessing && 'brightness-50 blur-sm'
        )}
      />

      {/* Processing overlay */}
      {photo.isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-poster-primary/20" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-poster-primary animate-spin" />
            <ImageIcon className="absolute inset-0 m-auto w-5 h-5 text-white" />
          </div>
          <p className="text-white text-xs font-medium mt-3 drop-shadow-lg">
            Embedding...
          </p>
        </div>
      )}

      {/* Hover overlay with actions */}
      {!photo.isProcessing && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Delete button */}
          <button
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center text-white/70 hover:text-error hover:bg-error/20 transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(photo.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">{photo.fileName}</p>
            </div>
            {score !== undefined && (
              <span
                className={cn(
                  'badge badge-xs font-semibold shrink-0 ml-2',
                  getScoreColor(score)
                )}
              >
                {formatScore(score)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Score badge (always visible when searching) */}
      {!photo.isProcessing && score !== undefined && (
        <div className="absolute top-2 left-2 group-hover:opacity-0 transition-opacity duration-200">
          <span
            className={cn(
              'badge badge-xs font-semibold shadow-md',
              getScoreColor(score)
            )}
          >
            {formatScore(score)}
          </span>
        </div>
      )}
    </div>
  );
}
