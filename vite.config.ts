import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type IndexHtmlTransformResult} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_URL || './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'async-css',
        transformIndexHtml(html: string): IndexHtmlTransformResult {
          if (String(process.env.VITE_APP_EDITION || '').trim() === 'lite') {
            html = html.split('Nexus Full').join('Nexus Lite');
          }
          if (html.includes('rel="stylesheet"')) {
            const href = html.match(/href="([^"]+\.css)"/)?.[1] || '/assets/index.css';
            const asyncLink = html.replace(
              '<link rel="stylesheet"',
              '<link rel="preload" as="style" onload="this.onload=null;this.rel=\'stylesheet\'"'
            );
            return asyncLink.replace('</head>', `\n<noscript><link rel="stylesheet" href="${href}"></noscript>\n</head>`);
          }
          return html;
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Vendor separado: caché independiente y carga paralela del bundle principal.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            return 'vendor-misc';
          },
        },
      },
    },
  };
});
