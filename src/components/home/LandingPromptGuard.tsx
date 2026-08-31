import { useEffect, useRef } from 'react';

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function LandingPromptGuard() {
  const landingPromptRef = useRef('');
  const restoringRef = useRef(false);

  useEffect(() => {
    const onInput = (event: Event) => {
      if (document.body.dataset.sonaraLanding !== 'true' || restoringRef.current) return;
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || target.id !== 'sonara-prompt') return;
      const value = target.value.trim();
      if (value) landingPromptRef.current = value;
    };

    const onTaxonomyChange = (event: Event) => {
      if (document.body.dataset.sonaraLanding !== 'true' || !landingPromptRef.current) return;
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const card = target.closest('section');
      if (!card?.querySelector('#sonara-prompt')) return;

      window.setTimeout(() => {
        if (document.body.dataset.sonaraLanding !== 'true' || !landingPromptRef.current) return;
        const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
        if (!textarea || textarea.value.trim() === landingPromptRef.current) return;
        restoringRef.current = true;
        setControlledTextareaValue(textarea, landingPromptRef.current);
        restoringRef.current = false;
      }, 110);
    };

    const onLandingState = () => {
      if (document.body.dataset.sonaraLanding !== 'true') landingPromptRef.current = '';
    };

    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onTaxonomyChange, true);
    const observer = new MutationObserver(onLandingState);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-sonara-landing'] });

    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onTaxonomyChange, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
