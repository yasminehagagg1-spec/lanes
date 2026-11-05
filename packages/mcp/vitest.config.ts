import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Read @lanes/shared from source so tests don't need a build first.
const conditions = ['source', ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: ['source'] } },
  test: {
    // Date tests assume the Mac's timezone.
    env: { TZ: 'Africa/Cairo' },
  },
});
