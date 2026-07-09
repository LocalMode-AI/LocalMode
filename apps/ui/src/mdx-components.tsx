import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { AutoTypeTable } from '@/components/auto-type-table';
import { InstallTabs } from '@/components/install-tabs';
import { OpenInV0 } from '@/components/open-in-v0';
import { ComponentPreview } from '@/components/component-preview';
import { ComponentsIndex } from '@/components/components-index';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    Callout,
    Card,
    Cards,
    // fumadocs-typescript: auto props table sourced from registry/localmode/**
    AutoTypeTable,
    // Registry-specific MDX helpers
    InstallTabs,
    OpenInV0,
    ComponentPreview,
    ComponentsIndex,
    ...components,
  };
}
