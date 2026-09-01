const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/components/studio/StudioSectionControl.tsx');
let source = fs.readFileSync(file, 'utf8');
const MARKER = 'SONARA_STUDIO_KEY_CONTROL_V1';
if (source.includes(MARKER)) {
  console.log('[SONARA] Studio key control already active.');
  process.exit(0);
}

function replace(anchor, replacement, label) {
  if (!source.includes(anchor)) {
    console.error(`[SONARA] Studio key control failed: ${label} anchor not found.`);
    process.exit(1);
  }
  source = source.replace(anchor, replacement);
}

replace(
  "const DEFAULT_BPM = 124;",
  "const DEFAULT_BPM = 124;\nconst STUDIO_KEY_STORAGE = 'sonara.studio.keySignature';\nconst STUDIO_KEYS = ['C Major','C# Major','D Major','Eb Major','E Major','F Major','F# Major','G Major','Ab Major','A Major','Bb Major','B Major','C Minor','C# Minor','D Minor','Eb Minor','E Minor','F Minor','F# Minor','G Minor','Ab Minor','A Minor','Bb Minor','B Minor'];\nconst SONARA_STUDIO_KEY_CONTROL_V1 = true;",
  'key constants'
);

replace(
  "function storedBpm() {\n  const value = Number(window.localStorage.getItem('sonara.preferredBpm'));\n  return Number.isFinite(value) ? Math.max(40, Math.min(220, Math.round(value))) : DEFAULT_BPM;\n}",
  "function storedBpm() {\n  const value = Number(window.localStorage.getItem('sonara.preferredBpm'));\n  return Number.isFinite(value) ? Math.max(40, Math.min(220, Math.round(value))) : DEFAULT_BPM;\n}\n\nfunction storedStudioKey() {\n  const value = String(window.localStorage.getItem(STUDIO_KEY_STORAGE) || 'A Minor');\n  return STUDIO_KEYS.includes(value) ? value : 'A Minor';\n}",
  'stored key helper'
);

replace(
  "  const [bpm, setBpm] = useState(storedBpm);\n  const [audioUrl, setAudioUrl] = useState('');",
  "  const [bpm, setBpm] = useState(storedBpm);\n  const [keySignature, setKeySignature] = useState(storedStudioKey);\n  const [audioUrl, setAudioUrl] = useState('');",
  'key state'
);

replace(
  "    setBpm(storedBpm());\n    setFocusMode(true);",
  "    setBpm(storedBpm());\n    setKeySignature(storedStudioKey());\n    setFocusMode(true);",
  'hydrate key'
);

replace(
  '<div className="px-2 text-[10px] font-semibold text-slate-300">A Minor</div>',
  `<select\n                  value={keySignature}\n                  onChange={event => {\n                    const value = event.target.value;\n                    setKeySignature(value);\n                    window.localStorage.setItem(STUDIO_KEY_STORAGE, value);\n                  }}\n                  className="bg-transparent px-2 text-[10px] font-semibold text-slate-300 outline-none"\n                  aria-label="Tonalità Studio"\n                >\n                  {STUDIO_KEYS.map(value => <option key={value} value={value}>{value}</option>)}\n                </select>`,
  'visible key selector'
);

source = source.replaceAll('keySignature="A Minor"', 'keySignature={keySignature}');
source = source.replace('}, [open, audioUrl, title, bpm, focusMode]);', '}, [open, audioUrl, title, bpm, keySignature, focusMode]);');

fs.writeFileSync(file, source);
console.log('[SONARA] Studio key selector activated and connected to Sessions + native Studio.');
