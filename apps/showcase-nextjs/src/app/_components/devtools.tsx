'use client';

import dynamic from 'next/dynamic';

const Widget = dynamic(
  () => import('@localmode/devtools/widget').then((m) => m.DevToolsWidget),
  { ssr: false }
);

export function DevTools() {
  return <Widget />;
}
