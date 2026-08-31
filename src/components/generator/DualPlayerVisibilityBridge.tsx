import { useEffect } from 'react';

function syncDualPlayers() {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-sonara-eleven-generator-host], [data-sonara-dual-generator-host]'
    )
  );

  for (const host of hosts) {
    host.dataset.sonaraDualGeneratorHost = 'true';
    host.dataset.sonaraCreatorDual = 'true';

    const explicit = host.querySelector<HTMLElement>('[data-sonara-creator-results="true"]');
    const candidateGrid = explicit || Array.from(host.querySelectorAll<HTMLElement>('div')).find(node =>
      Array.from(node.children).some(child => child.tagName === 'ARTICLE')
    );

    if (!candidateGrid) continue;

    candidateGrid.dataset.sonaraCreatorResults = 'true';

    // Permanent safeguard against legacy Creator CSS that used to hide the
    // first div after the Create button. Inline !important intentionally wins.
    candidateGrid.style.setProperty('display', 'grid', 'important');
    candidateGrid.style.setProperty('visibility', 'visible', 'important');
    candidateGrid.style.setProperty('opacity', '1', 'important');
    candidateGrid.style.setProperty('pointer-events', 'auto', 'important');

    for (const article of Array.from(candidateGrid.querySelectorAll<HTMLElement>('article'))) {
      article.style.setProperty('display', 'block', 'important');
      article.style.setProperty('visibility', 'visible', 'important');
      article.style.setProperty('opacity', '1', 'important');
      article.style.setProperty('pointer-events', 'auto', 'important');

      // Professional SONARA players use a hidden audio engine plus custom UI.
      // Never expose the browser-native audio controls again.
      const customAudio = article.querySelector<HTMLAudioElement>('audio[data-sonara-custom-audio="true"]');
      if (customAudio) {
        customAudio.controls = false;
        customAudio.style.setProperty('display', 'none', 'important');
        customAudio.style.setProperty('visibility', 'hidden', 'important');
        customAudio.style.setProperty('width', '0', 'important');
        customAudio.style.setProperty('height', '0', 'important');
        customAudio.style.setProperty('pointer-events', 'none', 'important');
      }
    }
  }
}

export default function DualPlayerVisibilityBridge() {
  useEffect(() => {
    syncDualPlayers();

    const observer = new MutationObserver(syncDualPlayers);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const refresh = () => syncDualPlayers();
    window.addEventListener('sonara:billing-updated', refresh);
    window.addEventListener('sonara:generated-track-selected', refresh);
    window.addEventListener('resize', refresh);

    return () => {
      observer.disconnect();
      window.removeEventListener('sonara:billing-updated', refresh);
      window.removeEventListener('sonara:generated-track-selected', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, []);

  return null;
}
