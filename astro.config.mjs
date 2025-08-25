// @ts-check
import { defineConfig } from 'astro/config';
import remarkUnwrapImages from 'remark-unwrap-images';
import remarkImages from 'remark-images';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true
    },
    remarkPlugins: [
      remarkUnwrapImages,
      
      [remarkImages, {
        loading: 'lazy',
        decoding: 'async',
        
        sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 75vw, 50vw',
        
        className: 'blog-image',
        
        processUrlSchemes: ['https', 'http']
      }]
    ],
  },
  site: 'https://tr0x0a.github.io',
});