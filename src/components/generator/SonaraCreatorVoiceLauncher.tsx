import { useEffect } from 'react';

const VOICE_DIRECT_ATTR = 'sonaraVoiceDirect';

function creatorActionButton(label: string): HTMLButtonElement | null {
  const wanted = label.trim().toLowerCase();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.sonara-creator-actions button'))
    .find(button => button.textContent?.trim().toLowerCase() === wanted) || null;
}

function restoreAudioHeader(hub: HTMLElement | null) {
  if (!hub) return;
  delete hub.dataset[VOICE_DIRECT_ATTR];
  hub.setAttribute('aria-label', 'SONARA Audio');
  const title = hub.querySelector<HTMLElement>('.sonara-audio-hub-title strong');
  const kicker = hub.querySelector<HTMLElement>('.sonara-audio-hub-title small');
  if (title) title.textContent = 'Audio';
  if (kicker) kicker.textContent = 'LIBRERIA · UPLOAD · VOCE';
}

function decorateVoiceHeader(hub: HTMLElement) {
  hub.dataset[VOICE_DIRECT_ATTR] = 'true';
  hub.setAttribute('aria-label', 'SONARA Voice');
  const title = hub.querySelector<HTMLElement>('.sonara-audio-hub-title strong');
  const kicker = hub.querySelector<HTMLElement>('.sonara-audio-hub-title small');
  if (title) title.textContent = 'Voice';
  if (kicker) kicker.textContent = 'REGISTRAZIONE VOCALE · VOICE IDENTITY';
}

function openVoiceRecorder() {
  window.dispatchEvent(new CustomEvent('sonara:open-creator-audio'));

  let attempts = 0;
  const activate = () => {
    attempts += 1;
    const hub = document.querySelector<HTMLElement>('.sonara-audio-hub');
    const voiceTab = Array.from(document.querySelectorAll<HTMLButtonElement>('.sonara-audio-tabs button'))
      .find(button => button.textContent?.toLowerCase().includes('registra voce'));

    if (hub && voiceTab) {
      voiceTab.click();
      decorateVoiceHeader(hub);
      window.setTimeout(() => {
        const recordButton = hub.querySelector<HTMLButtonElement>('.sonara-audio-record');
        recordButton?.focus({ preventScroll: true });
      }, 80);
      return;
    }

    if (attempts < 40) window.setTimeout(activate, 25);
  };

  activate();
}

export default function SonaraCreatorVoiceLauncher() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('button') as HTMLButtonElement | null
        : null;
      if (!target?.closest('.sonara-creator-actions')) return;

      const label = target.textContent?.trim().toLowerCase();
      if (label === 'voice') {
        event.preventDefault();
        event.stopPropagation();
        setTimeout(openVoiceRecorder, 0);
        return;
      }

      if (label === 'audio') {
        restoreAudioHeader(document.querySelector<HTMLElement>('.sonara-audio-hub'));
      }
    };

    const onDirectOpen = () => openVoiceRecorder();
    document.addEventListener('click', onClick, true);
    window.addEventListener('sonara:open-creator-voice', onDirectOpen);

    const observer = new MutationObserver(() => {
      const voiceButton = creatorActionButton('voice');
      if (voiceButton) {
        voiceButton.title = 'Registra la tua voce';
        voiceButton.setAttribute('aria-label', 'Apri registrazione della propria voce');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const voiceButton = creatorActionButton('voice');
    if (voiceButton) {
      voiceButton.title = 'Registra la tua voce';
      voiceButton.setAttribute('aria-label', 'Apri registrazione della propria voce');
    }

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('sonara:open-creator-voice', onDirectOpen);
      observer.disconnect();
      restoreAudioHeader(document.querySelector<HTMLElement>('.sonara-audio-hub'));
    };
  }, []);

  return (
    <style>{`
      .sonara-audio-hub[data-sonara-voice-direct="true"]{width:min(720px,calc(100vw - 32px))!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-tabs{display:none!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-body{padding-top:8px!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-voice-pane{min-height:430px!important;padding:42px 28px 34px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-mic-orb{width:96px!important;height:96px!important;border-radius:999px!important;box-shadow:0 0 0 12px rgba(124,58,237,.06),0 0 52px rgba(124,58,237,.22)!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-mic-orb svg{width:34px!important;height:34px!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-voice-pane>strong{margin-top:22px!important;font-size:22px!important;letter-spacing:-.025em!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-voice-pane>p{max-width:520px!important;margin-top:10px!important;font-size:13px!important;line-height:1.7!important;color:#94a3b8!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-record{min-width:250px!important;min-height:52px!important;margin-top:22px!important;font-size:12px!important;font-weight:950!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-voice-preview{width:min(100%,520px)!important;margin-top:22px!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-voice-preview audio{width:100%!important}
      .sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-privacy{max-width:560px!important;margin-top:18px!important;line-height:1.6!important}
      @media(max-width:640px){.sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-voice-pane{min-height:360px!important;padding:30px 18px!important}.sonara-audio-hub[data-sonara-voice-direct="true"] .sonara-audio-record{min-width:0!important;width:100%!important}}
    `}</style>
  );
}
