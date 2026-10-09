import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the build work from any sub-path (GitHub Pages) as well as Vercel.
export default defineConfig({
  plugins: [react()],
  base: './',
});
