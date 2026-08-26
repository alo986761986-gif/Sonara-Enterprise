import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import BootAuth from './components/auth/BootAuth';
import LegalDocumentPage from './components/legal/LegalDocumentPage';
import IntelligentPromptControl from './components/generator/IntelligentPromptControl';
import IntelligentLyricsControl from './components/generator/IntelligentLyricsControl';
import VocalCharacterControl from './components/generator/VocalCharacterControl';
import DualTrackGenerationControl from './components/generator/DualTrackGenerationControl';
import StudioSectionControl from './components/studio/StudioSectionControl';
import './index.css';

const legalPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
const legalKind = legalPath === '/terms' ? 'terms' : legalPath === '/privacy' ? 'privacy' : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {legalKind ? <LegalDocumentPage kind={legalKind} /> : (
      <>
        <BootAuth>
          <App />
        </BootAuth>
        <IntelligentPromptControl />
        <IntelligentLyricsControl />
        <VocalCharacterControl />
        <DualTrackGenerationControl />
        <StudioSectionControl />
      </>
    )}
  </React.StrictMode>
);