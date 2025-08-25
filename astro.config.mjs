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
      // Remove wrapping paragraphs around images for cleaner styling
      remarkUnwrapImages,
      
      // Optimize external images
      [remarkImages, {
        // Performance optimizations
        loading: 'lazy',
        decoding: 'async',
        
        // Add responsive behavior
        sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 75vw, 50vw',
        
        // Style hook
        className: 'blog-image',
        
        // Only process external URLs (your GitHub raw content)
        processUrlSchemes: ['https', 'http']
      }]
    ],
  },
});