/**
 * @file dom-baseline.ts
 * @description Baseline native-element prop types, used ONLY by
 * `auto-type-table.tsx` to compute the set of inherited DOM/ARIA attribute names
 * (aria-*, on* handlers, className/style/id/…, and element-specific attrs) so the
 * generated props tables can omit them and show only each component's OWN props.
 * These exports are never rendered — they exist so fumadocs-typescript can
 * enumerate `React.ComponentProps<'…'>` for every element the registry extends.
 */
import type { ComponentProps } from 'react';

export type DomBaselineDiv = ComponentProps<'div'>;
export type DomBaselineButton = ComponentProps<'button'>;
export type DomBaselineSpan = ComponentProps<'span'>;
export type DomBaselineOl = ComponentProps<'ol'>;
export type DomBaselineTextarea = ComponentProps<'textarea'>;
export type DomBaselineSection = ComponentProps<'section'>;
export type DomBaselineP = ComponentProps<'p'>;
export type DomBaselineLi = ComponentProps<'li'>;
export type DomBaselineForm = ComponentProps<'form'>;
export type DomBaselineFigure = ComponentProps<'figure'>;
export type DomBaselineBlockquote = ComponentProps<'blockquote'>;
export type DomBaselineA = ComponentProps<'a'>;
export type DomBaselineInput = ComponentProps<'input'>;
