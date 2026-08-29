import React, { useEffect, useState } from 'react';

const BRAND_ICON = '/sonara-brand-icon.svg?v=20260829-5';
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-4';
const BRAND_ALT = 'SONARA Enterprise';
const BOOT_DURATION_MS = 1900;
const BOOT_FAILSAFE_MS = 2600;

function isSonaraBrandIcon(src: string) {
  try {
    return new URL(src, window.location.origin).pathname === '/sonara-brand-icon.svg';
  } catch {
    return src.includes('/sonara-brand-icon.svg');
  }
}

function setBrandImage(image: HTMLImageElement) {
  const current = image.getAttribute('src') || '';

  // Do not rewrite an already branded image. The Cloudflare edge layer may
  // append its own cache-busting version, and repeatedly replacing that src
  // can create a MutationObserver feedback loop that blocks the main thread.
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
  const [showBoot, setShowBoot] = useState(true);

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

    // Observe structural changes only. Watching src/alt attributes caused the
    // app-side brand control and the edge-side brand control to rewrite each
    // other indefinitely, starving the boot timeout.
    const observer = new MutationObserver(applyBrand);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true
    });

    const normalTimer = window.setTimeout(() => setShowBoot(false), BOOT_DURATION_MS);
    const failsafeTimer = window.setTimeout(() => setShowBoot(false), BOOT_FAILSAFE_MS);

    return () => {
      window.clearTimeout(normalTimer);
      window.clearTimeout(failsafeTimer);
      observer.disconnect();
    };
  }, []);

  if (!showBoot) return null;

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-hidden bg-black"
      aria-label="SONARA boot animation"
      data-sonara-boot="active"
      onClick={() => setShowBoot(false)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,115,255,0.13),transparent_48%)]" />
      <img
        src={BRAND_BOOT}
        alt="SONARA Creative AI Platform"
        className="relative h-full w-full object-contain animate-[sonaraBrandBoot_1.9s_ease-out_forwards]"
        loading="eager"
        decoding="async"
        onAnimationEnd={() => setShowBoot(false)}
        onError={() => setShowBoot(false)}
      />
      <style>{`
        @keyframes sonaraBrandBoot {
          0% { opacity: 0; transform: scale(.965); filter: blur(8px); }
          22% { opacity: 1; transform: scale(1); filter: blur(0); }
          78% { opacity: 1; transform: scale(1.01); filter: blur(0); }
          100% { opacity: 0; transform: scale(1.025); filter: blur(1px); }
        }
      `}</style>
    </div>
  );
}
