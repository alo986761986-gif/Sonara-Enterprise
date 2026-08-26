import { useEffect } from 'react';

const DEFAULT_VALUE = '__sonara_default__';
const DEFAULT_LABEL = 'DEFAULT';

function randomIndex(length: number): number {
  if (length <= 1) return 0;
  try {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % length;
  } catch {
    return Math.floor(Math.random() * length);
  }
}

function actualOptions(select: HTMLSelectElement): HTMLOptionElement[] {
  return Array.from(select.options).filter(option => option.value !== DEFAULT_VALUE && !option.disabled);
}

function installDefaultOption(select: HTMLSelectElement) {
  if (Array.from(select.options).some(option => option.value === DEFAULT_VALUE)) return;
  const option = document.createElement('option');
  option.value = DEFAULT_VALUE;
  option.textContent = DEFAULT_LABEL;
  select.insertBefore(option, select.firstChild);
}

function dispatchSelection(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export default function DefaultMusicSelectionControl() {
  useEffect(() => {
    let resolving = false;
    let bypassGenerate = false;
    let generatorCard: HTMLElement | null = null;
    let taxonomySelects: HTMLSelectElement[] = [];
    const defaultFlags = [true, true, true, true];

    const findGenerator = () => {
      const prompt = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const card = prompt?.closest('section') as HTMLElement | null;
      if (!card) return false;
      const selects = Array.from(card.querySelectorAll('select')).slice(0, 4) as HTMLSelectElement[];
      if (selects.length < 4) return false;
      generatorCard = card;
      taxonomySelects = selects;
      return true;
    };

    const ensureDefaults = () => {
      if (!findGenerator()) return;
      taxonomySelects.forEach((select, index) => {
        installDefaultOption(select);
        select.dataset.sonaraTaxonomyDefault = defaultFlags[index] ? 'true' : 'false';
        if (defaultFlags[index] && !resolving && !select.disabled) select.value = DEFAULT_VALUE;
      });
    };

    const markDownstreamDefault = (index: number) => {
      for (let cursor = index + 1; cursor < defaultFlags.length; cursor += 1) defaultFlags[cursor] = true;
    };

    const onChangeCapture = (event: Event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      ensureDefaults();
      const index = taxonomySelects.indexOf(event.target);
      if (index < 0 || resolving) return;

      if (event.target.value === DEFAULT_VALUE) {
        defaultFlags[index] = true;
        markDownstreamDefault(index);
        event.stopImmediatePropagation();
        queueMicrotask(ensureDefaults);
        return;
      }

      defaultFlags[index] = false;
      markDownstreamDefault(index);
      queueMicrotask(ensureDefaults);
    };

    const findGenerateButton = (): HTMLButtonElement | null => {
      if (!generatorCard) return null;
      return Array.from(generatorCard.querySelectorAll('button')).find(button => {
        const className = String(button.className || '');
        return className.includes('w-full') && className.includes('bg-gradient-to-r');
      }) || null;
    };

    const resolveSelect = async (index: number) => {
      ensureDefaults();
      const select = taxonomySelects[index];
      if (!select || !defaultFlags[index]) return;
      const options = actualOptions(select);
      if (!options.length) return;
      const selected = options[randomIndex(options.length)];
      dispatchSelection(select, selected.value);
      await nextFrame();
      await nextFrame();
    };

    const resolveDefaultsAndGenerate = async (button: HTMLButtonElement) => {
      resolving = true;
      try {
        for (let index = 0; index < 4; index += 1) await resolveSelect(index);
        await nextFrame();
        bypassGenerate = true;
        button.click();
      } finally {
        resolving = false;
        window.setTimeout(ensureDefaults, 0);
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      ensureDefaults();
      const button = findGenerateButton();
      if (!button || !button.contains(event.target)) return;
      if (bypassGenerate) {
        bypassGenerate = false;
        return;
      }
      if (!defaultFlags.some(Boolean)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void resolveDefaultsAndGenerate(button);
    };

    ensureDefaults();
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('click', onClickCapture, true);
    const observer = new MutationObserver(ensureDefaults);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.removeEventListener('change', onChangeCapture, true);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return null;
}
