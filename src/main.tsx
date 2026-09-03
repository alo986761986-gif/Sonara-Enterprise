import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import BootAuth from './components/auth/BootAuth';
import LegalDocumentPage from './components/legal/LegalDocumentPage';
import IntelligentPromptControl from './components/generator/IntelligentPromptControl';
import IntelligentLyricsControl from './components/generator/IntelligentLyricsControl';
import VocalCharacterControl from './components/generator/VocalCharacterControl';
import ElevenMusicGenerationControl from './components/generator/ElevenMusicGenerationControl';
import DualPlayerVisibilityBridge from './components/generator/DualPlayerVisibilityBridge';
import LyricsApiCompatibilityBridge from './components/generator/LyricsApiCompatibilityBridge';
import RealMusicIntelligenceBridge from './components/generator/RealMusicIntelligenceBridge';
import BpmModeControl from './components/generator/BpmModeControl';
import SonaraCreatorSkin from './components/generator/SonaraCreatorSkin';
import SonaraCreatorLayoutPolish from './components/generator/SonaraCreatorLayoutPolish';
import SonaraCreatorAudioHub from './components/generator/SonaraCreatorAudioHub';
import SonaraCreatorVoiceLauncher from './components/generator/SonaraCreatorVoiceLauncher';
import SonaraCreatorVoiceClipShelf from './components/generator/SonaraCreatorVoiceClipShelf';
import SunoStylePromptControl from './components/generator/SunoStylePromptControl';
import GlobalMusicSuggestionControl from './components/generator/GlobalMusicSuggestionControl';
import SonaraInteractiveMiniGuide from './components/generator/SonaraInteractiveMiniGuide';
import GenerationProfileControl from './components/generator/GenerationProfileControl';
import DirectorResultPanel from './components/generator/DirectorResultPanel';
import SonaraSunoLanding from './components/home/SonaraSunoLanding';
import LandingPromptGuard from './components/home/LandingPromptGuard';
import SonaraProfessionalFixedPlayer from './components/player/SonaraProfessionalFixedPlayer';
import SonaraUniversalPlayerBridge from './components/player/SonaraUniversalPlayerBridge';
import SonaraRemixSection from './components/remix/SonaraRemixSection';
import SonaraRemixAccessBridge from './components/remix/SonaraRemixAccessBridge';
import StudioSectionControl from './components/studio/StudioSectionControl';
import VideoAISectionControl from './components/video/VideoAISectionControl';
import DJSectionControl from './components/dj/DJSectionControl';
import SidebarIconPolish from './components/navigation/SidebarIconPolish';
import SonaraBrandControl from './components/brand/SonaraBrandControl';
import './index.css';

// SONARA A/B audio + cover production release marker (2026-09-03).
const legalPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
const legalKind = legalPath === '/terms' ? 'terms' : legalPath === '/privacy' ? 'privacy' : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {legalKind ? <LegalDocumentPage kind={legalKind} /> : (
      <>
        <SonaraBrandControl />
        <BootAuth>
          <>
            <App />
            <SonaraSunoLanding />
            <SonaraProfessionalFixedPlayer />
            <SonaraUniversalPlayerBridge />
            <SonaraRemixSection />
            <SonaraRemixAccessBridge />
          </>
        </BootAuth>
        <LandingPromptGuard />
        <LyricsApiCompatibilityBridge />
        <RealMusicIntelligenceBridge />
        <BpmModeControl />
        <IntelligentPromptControl />
        <IntelligentLyricsControl />
        <VocalCharacterControl />
        <ElevenMusicGenerationControl />
        <DualPlayerVisibilityBridge />
        <SunoStylePromptControl />
        <GlobalMusicSuggestionControl />
        <SonaraInteractiveMiniGuide />
        <GenerationProfileControl />
        <DirectorResultPanel />
        <SonaraCreatorSkin />
        <SonaraCreatorLayoutPolish />
        <SonaraCreatorAudioHub />
        <SonaraCreatorVoiceLauncher />
        <SonaraCreatorVoiceClipShelf />
        <StudioSectionControl />
        <VideoAISectionControl />
        <DJSectionControl />
        <SidebarIconPolish />
      </>
    )}
  </React.StrictMode>
);