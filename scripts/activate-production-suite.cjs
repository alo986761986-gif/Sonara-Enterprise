const fs = require('node:fs');
const path = require('node:path');

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
let source = fs.readFileSync(appPath, 'utf8');

const randomLyricsImport = `import { buildRandomLyrics } from './randomLyrics';`;
const houseLyricsImport = `import { buildHouseLyrics, hasHouseLyricsProfile } from './houseLyrics';`;
if (!source.includes(houseLyricsImport)) {
  if (!source.includes(randomLyricsImport)) {
    throw new Error('SONARA House lyrics activation failed: random lyrics import marker not found.');
  }
  source = source.replace(randomLyricsImport, `${randomLyricsImport}\n${houseLyricsImport}`);
}

const oldRandomizeLyrics = `  const randomizeLyrics = () => {\n    lyricsVariantRef.current = (lyricsVariantRef.current + 1) % 4;\n    setLyrics(buildRandomLyrics({\n      language: vocalLanguage,\n      genre,\n      subgenre,\n      mood,\n      vocalMode,\n      variant: lyricsVariantRef.current\n    }));\n  };`;

const newRandomizeLyrics = `  const randomizeLyrics = () => {\n    lyricsVariantRef.current = (lyricsVariantRef.current + 1) % 4;\n    const useHouseLyrics = genreFamily === 'Electronic / Dance' && genre === 'House' && hasHouseLyricsProfile(subgenre);\n    setLyrics(useHouseLyrics\n      ? buildHouseLyrics({\n          language: vocalLanguage,\n          subgenre,\n          mood,\n          vocalMode,\n          variant: lyricsVariantRef.current,\n          durationSec\n        })\n      : buildRandomLyrics({\n          language: vocalLanguage,\n          genre,\n          subgenre,\n          mood,\n          vocalMode,\n          variant: lyricsVariantRef.current\n        }));\n  };`;

if (!source.includes('const useHouseLyrics = genreFamily')) {
  if (!source.includes(oldRandomizeLyrics)) {
    throw new Error('SONARA House lyrics activation failed: randomizeLyrics marker not found.');
  }
  source = source.replace(oldRandomizeLyrics, newRandomizeLyrics);
}

const firebaseImport = `import { getFirebaseIdToken, watchFirebaseUser } from './lib/firebaseClient';`;
const socialImport = `import SocialDiscoveryCenter from './components/discovery/SocialDiscoveryCenter';`;
if (!source.includes(socialImport)) {
  if (!source.includes(firebaseImport)) {
    throw new Error('SONARA social discovery activation failed: App import marker not found.');
  }
  source = source.replace(firebaseImport, `${firebaseImport}\n${socialImport}`);
}

// Social Discovery is bundled directly so navigation never waits on a large WebGL chunk.
// Remove the legacy globe loader: even unused, it creates a ~1.9 MB production chunk.
const legacyGlobeImport = `const WorldDiscoveryGlobe = React.lazy(() => import('./components/discovery/WorldDiscoveryGlobe'));\n`;
if (source.includes(legacyGlobeImport)) {
  source = source.replace(legacyGlobeImport, '');
}

const lazyMarker = `const ProfessionalAudioEqualizer = React.lazy(() =>\n  import('./components/eq/ProfessionalAudioEqualizer').then(module => ({ default: module.ProfessionalAudioEqualizer }))\n);\n\ntype JobStatus`;
const lazyReplacement = `const ProfessionalAudioEqualizer = React.lazy(() =>\n  import('./components/eq/ProfessionalAudioEqualizer').then(module => ({ default: module.ProfessionalAudioEqualizer }))\n);\nconst ProductionCenter = React.lazy(() =>\n  import('./components/production/ProductionCenter').then(module => ({ default: module.ProductionCenter }))\n);\nconst SonaraStore = React.lazy(() => import('./components/marketplace/SonaraStore'));\n\ntype JobStatus`;

if (!source.includes("./components/production/ProductionCenter") || !source.includes("./components/marketplace/SonaraStore")) {
  if (!source.includes(lazyMarker)) {
    throw new Error('SONARA activation failed: lazy import marker not found.');
  }
  source = source.replace(lazyMarker, lazyReplacement);
}

const oldProductionView = `  const productionView = (\n    <Card className=\"p-6\"><SectionTitle icon={Cpu} title={t('productionTitle')} subtitle={t('productionSubtitle')} /><div className=\"grid gap-4 md:grid-cols-2 xl:grid-cols-4\"><MiniCard icon={SlidersHorizontal} title=\"Mixing Console\" text=\"Balance, panorama, dynamics and spatial processing.\" /><MiniCard icon={Disc3} title=\"Mastering\" text=\"Loudness, tone, stereo image and delivery targets.\" /><MiniCard icon={Library} title=\"Stem Manager\" text=\"Vocals, drums, bass, instruments and reusable stems.\" /><MiniCard icon={UploadCloud} title=\"Export Center\" text=\"Master, stems and release-ready formats.\" /></div></Card>\n  );`;

const newProductionView = `  const productionView = (\n    <React.Suspense fallback={<Card className=\"flex min-h-[420px] items-center justify-center p-6 text-xs text-slate-500\"><RefreshCw className=\"mr-2 h-4 w-4 animate-spin text-purple-400\" />Caricamento SONARA Production Suite...</Card>}>\n      <ProductionCenter\n        audioUrl={audioUrl}\n        audioFormat={audioFormat}\n        title={title}\n        onProcessedAudio={(url, metrics) => void handleProcessedAudio(url, metrics)}\n        onOpenMastering={() => setActiveTab('eq')}\n      />\n    </React.Suspense>\n  );`;

if (!source.includes('<ProductionCenter')) {
  if (!source.includes(oldProductionView)) throw new Error('SONARA production activation failed: production view marker not found.');
  source = source.replace(oldProductionView, newProductionView);
}

const oldMarketplaceView = `  const marketplaceView = (\n    <Card className=\"p-6\"><SectionTitle icon={Store} title={t('marketplaceTitle')} subtitle={t('marketplaceSubtitle')} /><div className=\"grid gap-4 md:grid-cols-3\"><MiniCard icon={Music} title=\"Samples & Loops\" text=\"Creator-ready musical assets.\" /><MiniCard icon={SlidersHorizontal} title=\"Presets & Templates\" text=\"Production presets and session templates.\" /><MiniCard icon={Sparkles} title=\"AI Assets\" text=\"Creative models and intelligent tools.\" /></div></Card>\n  );`;

const newMarketplaceView = `  const marketplaceView = (\n    <React.Suspense fallback={<Card className=\"flex min-h-[420px] items-center justify-center p-6 text-xs text-slate-500\"><RefreshCw className=\"mr-2 h-4 w-4 animate-spin text-purple-400\" />Caricamento SONARA Store...</Card>}>\n      <SonaraStore />\n    </React.Suspense>\n  );`;

if (!source.includes('<SonaraStore')) {
  if (!source.includes(oldMarketplaceView)) throw new Error('SONARA marketplace activation failed: marketplace view marker not found.');
  source = source.replace(oldMarketplaceView, newMarketplaceView);
}

const discoveryStart = `  const discoveryView = (`;
const discoveryEnd = `\n\n  const analyticsView = (`;
if (!source.includes('const discoveryView = (\n    <SocialDiscoveryCenter />')) {
  const start = source.indexOf(discoveryStart);
  const end = source.indexOf(discoveryEnd, start);
  if (start < 0 || end < 0) throw new Error('SONARA social discovery activation failed: discovery view marker not found.');
  const replacement = `  const discoveryView = (\n    <SocialDiscoveryCenter />\n  );`;
  source = source.slice(0, start) + replacement + source.slice(end);
}

fs.writeFileSync(appPath, source, 'utf8');
console.log('[SONARA] House Lyrics activated: subgenre-aware writing and duration-aware extended structure.');
console.log('[SONARA] Production Suite activated: Mixing Console, Mastering, Stem Manager, Export Center.');
console.log('[SONARA] Marketplace activated: SONARA Store with verified catalog and Stripe one-time checkout.');
console.log('[SONARA] Social Discovery activated in main bundle: staged API loading, no WebGL chunk and no lazy-loading deadlock.');
