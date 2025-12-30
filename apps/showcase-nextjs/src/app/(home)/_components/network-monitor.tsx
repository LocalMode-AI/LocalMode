/**
 * Network Monitor Script
 *
 * Loads the network monitoring script that wraps fetch.
 * Uses beforeInteractive strategy to capture all network requests from the start.
 *
 * Note: The ESLint warning about beforeInteractive is for inline scripts in Pages Router.
 * External scripts with beforeInteractive work correctly in App Router.
 */

import Script from 'next/script';

export function NetworkMonitorScript() {
  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script id="network-monitor" src="/network-monitor.js" strategy="beforeInteractive" />
  );
}
