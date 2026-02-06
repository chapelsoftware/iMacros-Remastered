import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync, readdirSync } from 'fs';
import { viteStaticCopy, Target } from 'vite-plugin-static-copy';

// Extension requires multiple entry points for different contexts
const extensionEntries: Record<string, string> = {
  background: resolve(__dirname, 'src/background.ts'),
  content: resolve(__dirname, 'src/content.ts'),
  sidepanel: resolve(__dirname, 'src/sidepanel.ts'),
  panel: resolve(__dirname, 'src/panel/panel.ts'),
  editor: resolve(__dirname, 'src/editor/editor.ts'),
  options: resolve(__dirname, 'src/options/options.ts'),
};

// Check which entries exist
const availableEntries: Record<string, string> = {};
for (const [name, path] of Object.entries(extensionEntries)) {
  if (existsSync(path)) {
    availableEntries[name] = path;
  }
}

// Use index.ts as fallback if no specific entries exist
if (Object.keys(availableEntries).length === 0) {
  availableEntries['index'] = resolve(__dirname, 'src/index.ts');
}

// Build static copy targets, only including files/dirs that exist
const copyTargets: Target[] = [];

if (existsSync(resolve(__dirname, 'manifest.json'))) {
  copyTargets.push({ src: 'manifest.json', dest: '.' });
}

const iconsDir = resolve(__dirname, 'icons');
if (existsSync(iconsDir) && readdirSync(iconsDir).length > 0) {
  copyTargets.push({ src: 'icons/*', dest: 'icons' });
}

// Copy any HTML files
const htmlFiles = readdirSync(__dirname).filter((f) => f.endsWith('.html'));
if (htmlFiles.length > 0) {
  copyTargets.push({ src: '*.html', dest: '.' });
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
      input: availableEntries,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Extension scripts need to be self-contained (no code splitting for content scripts)
        manualChunks: undefined,
      },
    },
    // Ensure compatibility with browser extension environment
    target: 'esnext',
    minify: false, // Easier debugging for extensions
  },
  plugins: [
    viteStaticCopy({
      targets: copyTargets,
    }),
  ],
});
