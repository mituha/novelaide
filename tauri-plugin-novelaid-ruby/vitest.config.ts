import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['guest-js/**/*.{test,spec}.ts'],
  },
});
