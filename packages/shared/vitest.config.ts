import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Date tests assume the Mac's timezone.
    env: { TZ: 'Africa/Cairo' },
  },
});
