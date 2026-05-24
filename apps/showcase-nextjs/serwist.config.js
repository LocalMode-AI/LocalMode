// @ts-check
import { serwist } from '@serwist/next/config';

const revision = crypto.randomUUID();

export default serwist({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/offline', revision }],
});
