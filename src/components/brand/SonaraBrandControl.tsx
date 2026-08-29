import React, { useEffect, useState } from 'react';

const BRAND_ICON = '/sonara-brand-icon.svg?v=20260829-3';
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-3';

export default function SonaraBrandControl() {
  const [showBoot, setShowBoot] = useState(true);

  useEffect(() => {
    const swapLegacyLogos = () => {
      document.querySelectorAll<HTMLImageElement>('img[src*="sonara-ai-icon.png"]').forEach(image => {
        if (image.src.includes('sonara-brand-icon.svg')) return;
        image.src = BRAND_ICON;
        image.alt = 'SONARA';
      });
    };

    swapLegacyLogos();
    const observer = new MutationObserver(swapLegacyLogos);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

    const timer = window.setTimeout(() => setShowBoot(false), 1900);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  if (!showBoot) return null;

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-hidden bg-black" aria-label="SONARA boot animation">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,115,255,0.13),transparent_48%)]" />
      <img
        src={BRAND_BOOT}
        alt="SONARA Creative AI Platform"
        className="relative h-full w-full object-contain animate-[sonaraBrandBoot_1.9s_ease-out_forwards]"
        loading="eager"
        decoding="sync"
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
