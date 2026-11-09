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
import SonaraRemixAccessBridgeV2 from './components/remix/SonaraRemixAccessBridgeV2';
import StudioSectionControl from './components/studio/StudioSectionControl';
import VideoAISectionControl from './components/video/VideoAISectionControl';
import DJSectionControl from './components/dj/DJSectionControl';
import SidebarIconPolish from './components/navigation/SidebarIconPolish';
import SonaraBrandControl from './components/brand/SonaraBrandControl';
import './index.css';

// Never let a component crash turn the entire SONARA page black.
// No credentials, private job data, or stack traces are exposed here.
class SonaraBootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    console.error('[SONARA] UI render failed', error);
  }
  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#050914] px-6 text-center text-white">
        <img src="/sonara-brand-icon.svg" width={64} height={64} alt="SONARA" className="rounded-2xl" />
        <h1 className="text-2xl font-bold">SONARA Enterprise</h1>
        <p className="max-w-md text-sm text-slate-300">L'interfaccia non si è caricata correttamente. Ricarica la pagina per riprovare.</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white">
          Ricarica SONARA
        </button>
      </main>
    );
  }
}

// SONARA A/B audio + cover production release marker (2026-09-03).
const legalPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
const legalKind = legalPath === '/terms' ? 'terms' : legalPath === '/privacy' ? 'privacy' : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SonaraBootErrorBoundary>
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
            <SonaraRemixAccessBridgeV2 />
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
    </SonaraBootErrorBoundary>
  </React.StrictMode>
);