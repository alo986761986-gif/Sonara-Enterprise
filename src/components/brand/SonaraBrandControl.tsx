import React, { useEffect } from 'react';

const BRAND_ICON = '/sonara-brand-icon.svg?v=20260829-5';
const BRAND_ALT = 'SONARA Enterprise';

function isSonaraBrandIcon(src: string) {
  try {
    return new URL(src, window.location.origin).pathname === '/sonara-brand-icon.svg';
  } catch {
    return src.includes('/sonara-brand-icon.svg');
  }
}

function setBrandImage(image: HTMLImageElement) {
  const current = image.getAttribute('src') || '';

  // Keep the SONARA branding synchronized without showing any startup overlay.
  if (!isSonaraBrandIcon(current)) {
    image.src = BRAND_ICON;
  }

  if (image.alt !== BRAND_ALT) image.alt = BRAND_ALT;
  if (!image.width) image.width = 44;
  if (!image.height) image.height = 44;
  image.loading = 'eager';
  image.decoding = 'async';
  image.dataset.sonaraBrandLogo = 'true';
}

function installBrandBesideEnterpriseTitle() {
  document
    .querySelectorAll<HTMLImageElement>(
      'img[src*="sonara-ai-icon.png"], header img[alt*="SONARA" i], aside img[alt*="SONARA" i], img[data-sonara-brand-logo="true"]'
    )
    .forEach(setBrandImage);

  const exactEnterpriseLabels = Array.from(
    document.querySelectorAll<HTMLElement>('header span, header div, header h1, header h2, aside span, aside div, aside h1, aside h2')
  ).filter(element => {
    if (element.children.length > 0) return false;
    return (element.textContent || '').trim().toLowerCase() === 'sonara enterprise';
  });

  exactEnterpriseLabels.forEach(label => {
    let row: HTMLElement | null = label.parentElement;
    for (let depth = 0; row && depth < 3; depth += 1, row = row.parentElement) {
      const existing = row.querySelector<HTMLImageElement>('img');
      if (existing) {
        setBrandImage(existing);
        return;
      }
    }

    const parent = label.parentElement;
    if (!parent || parent.querySelector('[data-sonara-brand-logo="true"]')) return;

    const image = document.createElement('img');
    image.src = BRAND_ICON;
    image.alt = BRAND_ALT;
    image.width = 44;
    image.height = 44;
    image.loading = 'eager';
    image.decoding = 'async';
    image.dataset.sonaraBrandLogo = 'true';
    image.className = 'h-11 w-11 shrink-0 rounded-xl object-contain';
    image.style.marginRight = '12px';
    parent.insertBefore(image, label);
  });
}

export default function SonaraBrandControl() {
  useEffect(() => {
    let scheduled = false;
    const applyBrand = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        installBrandBesideEnterpriseTitle();
      });
    };

    applyBrand();

    const observer = new MutationObserver(applyBrand);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
