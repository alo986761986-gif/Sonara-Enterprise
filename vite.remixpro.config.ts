import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react()],
  build:{
    outDir:'dist-remix-v3',
    emptyOutDir:true,
    lib:{entry:'src/remixProStandalone.tsx',name:'SonaraRemixV3',formats:['es'],fileName:()=>'sonara-remix-v3.js',cssFileName:'sonara-remix-v3'},
    rollupOptions:{output:{assetFileNames:'sonara-remix-v3.css'}}
  }
});
