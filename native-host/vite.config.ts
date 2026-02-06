import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// Build electron entries list dynamically based on what exists
const electronEntries = [];

// Main process entry point
const mainEntry = resolve(__dirname, 'src/main.js');
if (existsSync(mainEntry)) {
  electronEntries.push({
    entry: mainEntry,
    vite: {
      build: {
        outDir: resolve(__dirname, 'dist'),
        rollupOptions: {
          external: ['electron'],
          output: {
            entryFileNames: 'main.js',
          },
        },
      },
      resolve: {
        alias: {
          '@shared': resolve(__dirname, '../shared/src'),
        },
      },
    },
  });
}

// Preload script (if exists)
const preloadEntry = resolve(__dirname, 'src/preload.ts');
if (existsSync(preloadEntry)) {
  electronEntries.push({
    entry: preloadEntry,
    onstart(options: { reload: () => void }) {
      options.reload();
    },
    vite: {
      build: {
        outDir: resolve(__dirname, 'dist'),
        rollupOptions: {
          external: ['electron'],
          output: {
            entryFileNames: 'preload.js',
          },
        },
      },
    },
  });
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: ['electron'],
    },
  },
  plugins: [
    electron(electronEntries),
    renderer(),
  ],
});
