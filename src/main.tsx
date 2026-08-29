import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import BootAuth from './components/auth/BootAuth';
import LegalDocumentPage from './components/legal/LegalDocumentPage';
import IntelligentPromptControl from './components/generator/IntelligentPromptControl';
import IntelligentLyricsControl from './components/generator/IntelligentLyricsControl';
import VocalCharacterControl from './components/generator/VocalCharacterControl';
import DualTrackGenerationControl from './components/generator/DualTrackGenerationControl';
import LyricsApiCompatibilityBridge from './components/generator/LyricsApiCompatibilityBridge';
import RealMusicIntelligenceBridge from './components/generator/RealMusicIntelligenceBridge';
import BpmModeControl from './components/generator/BpmModeControl';
import SonaraCreatorSkin from './components/generator/SonaraCreatorSkin';
import SunoStylePromptControl from './components/generator/SunoStylePromptControl';
import GlobalMusicSuggestionControl from './components/generator/GlobalMusicSuggestionControl';
import SonaraCreatorGuide from './components/generator/SonaraCreatorGuide';
import SonaraInlineHelpSystem from './components/generator/SonaraInlineHelpSystem';
import StudioSectionControl from './components/studio/StudioSectionControl';
import VideoAISectionControl from './components/video/VideoAISectionControl';
import DJSectionControl from './components/dj/DJSectionControl';
import SidebarIconPolish from './components/navigation/SidebarIconPolish';
import SonaraBrandControl from './components/brand/SonaraBrandControl';
import './index.css';

const legalPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
const legalKind = legalPath === '/terms' ? 'terms' : legalPath === '/privacy' ? 'privacy' : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {legalKind ? <LegalDocumentPage kind={legalKind} /> : (
      <>
        <SonaraBrandControl />
        <BootAuth>
          <App />
        </BootAuth>
        <LyricsApiCompatibilityBridge />
        <RealMusicIntelligenceBridge />
        <BpmModeControl />
        <IntelligentPromptControl />
        <IntelligentLyricsControl />
        <VocalCharacterControl />
        <DualTrackGenerationControl />
        <SunoStylePromptControl />
        <GlobalMusicSuggestionControl />
        <SonaraCreatorGuide />
        <SonaraInlineHelpSystem />
        <SonaraCreatorSkin />
        <StudioSectionControl />
        <VideoAISectionControl />
        <DJSectionControl />
        <SidebarIconPolish />
      </>
    )}
  </React.StrictMode>
);