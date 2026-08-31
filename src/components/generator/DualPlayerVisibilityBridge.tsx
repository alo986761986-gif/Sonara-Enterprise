import { useEffect } from 'react';

function syncDualPlayers() {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>('[data-sonara-eleven-generator-host]')
  );

  for (const host of hosts) {
    // The active generation control already produces candidates A/B. The Creator
    // skin expects this marker in order to place the result cards in Workspace.
    host.dataset.sonaraDualGeneratorHost = 'true';

    const candidateGrid = Array.from(host.querySelectorAll<HTMLElement>('div')).find(node =>
      Array.from(node.children).some(child => child.tagName === 'ARTICLE')
    );

    if (!candidateGrid) continue;

    candidateGrid.dataset.sonaraCreatorResults = 'true';

    for (const article of Array.from(candidateGrid.querySelectorAll<HTMLElement>('article'))) {
      article.style.removeProperty('display');
      article.style.removeProperty('visibility');
      article.style.removeProperty('opacity');

      const audio = article.querySelector<HTMLAudioElement>('audio');
      if (!audio) continue;

      audio.controls = true;
      audio.style.setProperty('display', 'block', 'important');
      audio.style.setProperty('visibility', 'visible', 'important');
      audio.style.setProperty('opacity', '1', 'important');
      audio.style.setProperty('width', '100%', 'important');
      audio.style.setProperty('min-height', '40px', 'important');
      audio.style.setProperty('pointer-events', 'auto', 'important');
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

    window.addEventListener('sonara:billing-updated', syncDualPlayers);
    window.addEventListener('sonara:generated-track-selected', syncDualPlayers);

    return () => {
      observer.disconnect();
      window.removeEventListener('sonara:billing-updated', syncDualPlayers);
      window.removeEventListener('sonara:generated-track-selected', syncDualPlayers);
    };
  }, []);

  return null;
}
