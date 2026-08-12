import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      // ACE-Step generations and Music Brain persistence mutate these paths at runtime.
      // They are not frontend source files and must not trigger a Vite reload that
      // wipes the active generation state just as a job completes.
      ignored: [
        '**/storage/**',
        '**/output/**',
        '**/data/music_brain_db.json',
      ],
    },
  },
});
