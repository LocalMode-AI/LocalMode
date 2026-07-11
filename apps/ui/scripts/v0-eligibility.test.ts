import { describe, expect, it } from 'vitest';

import { isV0Eligible, V0_VERIFIED } from '../src/lib/v0-eligibility';

// The gate is an empirical allowlist: every entry was opened in v0 and confirmed
// to render real UI (2026-07-10). These tests pin that set and guard against
// re-adding components whose v0 preview was verified to crash or render blank.

describe('isV0Eligible()', () => {
  it('is true for every v0-verified component', () => {
    for (const name of V0_VERIFIED) {
      expect(isV0Eligible(name)).toBe(true);
    }
  });

  it('shows the button for device-badge (verified rendering in v0)', () => {
    expect(isV0Eligible('ui/local-first/device-badge')).toBe(true);
  });

  it('hides the button for components whose v0 preview CRASHED', () => {
    // transcribed-note-card composes another primitive → "Element type is invalid";
    // vector-import-flow imports cn from a dev-tree path → module fails → undefined.
    expect(isV0Eligible('ui/audio/transcribed-note-card')).toBe(false);
    expect(isV0Eligible('ui/local-first/vector-import-flow')).toBe(false);
  });

  it('hides the button for components whose v0 preview rendered BLANK', () => {
    // Need data/stream to render anything when mounted bare.
    expect(isV0Eligible('ui/results/evaluation-metrics-dashboard')).toBe(false);
    expect(isV0Eligible('ui/media-vision/video-canvas')).toBe(false);
  });

  it('hides the button for shadcn-dependent and prop-required components', () => {
    expect(isV0Eligible('ui/conversation/pipeline-tracker')).toBe(false); // shadcn deps
    expect(isV0Eligible('ui/results/scored-result-bar-list')).toBe(false); // required props
  });

  it('hides the button for non-components and unknown names', () => {
    expect(isV0Eligible('ui/media-vision/use-webcam')).toBe(false); // hook
    expect(isV0Eligible('ui/blocks/chat')).toBe(false); // block
    expect(isV0Eligible('ui/does-not-exist')).toBe(false);
  });

  it('pins the verified set to the nine confirmed-good components', () => {
    expect(V0_VERIFIED.size).toBe(9);
  });
});
