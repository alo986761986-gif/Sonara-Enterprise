import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { analyzeCreatorBrief } from '../../generationPrompt';
import { getMusicStyleProfile } from '../../musicStyleIntelligence';
import { AssistantServiceInstance } from '../../services/AssistantService';

type BpmMode = 'manual' | 'auto';

type CreatorContext = {
  family: string;
  genre: string;
  subgenre: string;
  mood: string;
  keySignature: string;
  bpm: number;
  bpmMode: BpmMode;
  bpmReason: string;
  durationSec: number;
};

const MAX_INTELLIGENT_BRIEF_CHARS = 4300;

function compact(value: string, maxLength: number): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function readCreatorContext(textarea: HTMLTextAreaElement): CreatorContext {
  const card = textarea.closest('section');
  const selects = card ? Array.from(card.querySelectorAll('select')) : [];
  const valueAt = (index: number, fallback: string) => (selects[index] as HTMLSelectElement | undefined)?.value || fallback;
  const bpmInput = card?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  const bpmMode = bpmInput?.dataset.sonaraBpmMode === 'auto' || card?.dataset.sonaraBpmMode === 'auto' ? 'auto' : 'manual';

  return {
    family: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    mood: valueAt(3, 'Authentic'),
    keySignature: valueAt(4, 'A Minor'),
    bpm: Number(bpmInput?.value || 124),
    bpmMode,
    bpmReason: bpmInput?.dataset.sonaraAutoBpmReason || '',
    durationSec: Number(valueAt(5, '30'))
  };
}

function buildIntelligentBrief(currentPrompt: string, context: CreatorContext): string {
  const fallback = `Create an original, professional ${context.subgenre} track.`;
  const analysis = analyzeCreatorBrief(currentPrompt, fallback);
  const profile = getMusicStyleProfile(context.family, context.genre, context.subgenre);
  const creatorIntent = compact(analysis.normalized || fallback, analysis.detailed ? 1900 : 1200);
  const exclusions = analysis.exclusions.length
    ? `CREATOR EXCLUSIONS — STRICT: ${analysis.exclusions.join(' | ')}`
    : '';
  const tempoInstruction = context.bpmMode === 'auto'
    ? `SONARA AUTO BPM selected ${context.bpm} BPM from the live musical context${context.bpmReason ? ` (${context.bpmReason})` : ''}. Treat this as the intelligent tempo choice for this creation and keep it coherent with genre, subgenre, mood and groove.`
    : `Manual BPM lock: exactly ${context.bpm} BPM. The creator chose this tempo explicitly; do not change it.`;

  const sections = [
    `CREATOR INTENT — PRESERVE AS AUTHORITATIVE:\n${creatorIntent}`,
    `SONARA INTELLIGENT STYLE INTERPRETATION — ${context.subgenre}:\n${compact(profile.identity, 620)}`,
    `AUTHENTIC INSTRUMENTATION:\n${compact(profile.instrumentation, analysis.detailed ? 420 : 620)}`,
    `RHYTHM AND GROOVE:\n${compact(profile.rhythm, analysis.detailed ? 420 : 620)}`,
    `HARMONY / MUSICAL LANGUAGE:\n${compact(profile.harmony, analysis.detailed ? 360 : 520)}`,
    `ARRANGEMENT DIRECTION:\n${compact(profile.arrangement, analysis.detailed ? 360 : 520)}`,
    `PRODUCTION DIRECTION:\n${compact(profile.production, analysis.detailed ? 420 : 620)}`,
    `TEMPO INTELLIGENCE:\n${tempoInstruction}`,
    `TECHNICAL LOCKS:\n${context.family} → ${context.genre} → ${context.subgenre}; atmosphere ${context.mood}; active tempo ${context.bpm} BPM; key ${context.keySignature}; approximately ${context.durationSec} seconds with a complete musical-bar ending.`,
    exclusions,
    'INTELLIGENT PRIORITY RULE: never replace, weaken or contradict explicit creator instructions. Use the selected style DNA only to complete details the creator did not specify. Keep the result original, musically performed, evolving and release-ready.'
  ].filter(Boolean);

  return sections.join('\n\n').slice(0, MAX_INTELLIGENT_BRIEF_CHARS).trim();
}

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function IntelligentPromptControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const enabled = useMemo(
    () => AssistantServiceInstance.getActions().some(action => action.id === 'improve_prompt' && action.enabled),
    []
  );

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const toolbar = textarea?.previousElementSibling?.lastElementChild as HTMLElement | null;
      if (!textarea || !toolbar) {
        setMountNode(null);
        setDisabled(false);
        return;
      }

      let host = toolbar.querySelector('[data-sonara-intelligent-prompt-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('span');
        host.setAttribute('data-sonara-intelligent-prompt-host', 'true');
        host.className = 'inline-flex';
        toolbar.prepend(host);
      }

      const randomButton = toolbar.querySelector('button[title="Random prompt"]') as HTMLButtonElement | null;
      setDisabled(Boolean(randomButton?.disabled));
      setMountNode(host);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled || !mountNode) return null;

  const improvePrompt = () => {
    if (disabled) return;
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const context = readCreatorContext(textarea);
    const intelligentBrief = buildIntelligentBrief(textarea.value, context);
    setControlledTextareaValue(textarea, intelligentBrief);
    textarea.focus();
    setOptimized(true);
    window.setTimeout(() => setOptimized(false), 1400);
  };

  return createPortal(
    <button
      type="button"
      onClick={improvePrompt}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-[11px] font-black tracking-wider text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:opacity-50"
      title="Prompt Intelligente SONARA"
      aria-label="Migliora il prompt con Prompt Intelligente SONARA"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {optimized ? 'OTTIMIZZATO' : 'PROMPT INTELLIGENTE'}
    </button>,
    mountNode
  );
}
