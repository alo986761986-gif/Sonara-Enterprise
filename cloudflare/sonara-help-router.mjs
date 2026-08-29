import brandRuntime from './sonara-brand-router.mjs';
export { SonaraJobState } from './sonara-brand-router.mjs';

const HELP_VERSION = 'creator-inline-help-v1';

const CONTEXT_HELP_SCRIPT = `<script id="sonara-context-help-edge-v1">(()=>{const items=[
{id:'prompt',title:'Prompt musica',summary:'Descrive il brano che SONARA deve creare.',how:'Scrivi genere, strumenti, atmosfera, struttura, voce e BPM. Le richieste esplicite nel prompt hanno priorità.',example:'Jungle / Drum & Bass aggressiva, rolling sub bass, rave dark, 170 BPM.',selectors:['#sonara-prompt']},
{id:'world',title:'Universo Musica & Strumenti',summary:'Libreria di generi, tradizioni e strumenti da tutto il mondo.',how:'Cerca una voce e cliccala per aggiungerla al prompt. Puoi combinarne più di una.',example:'Afro House + Kora + Djembe + Analog Synthesizer.',selectors:['.sonara-global-suggestions-toggle','#sonara-world-suggestions-edge .swe-toggle']},
{id:'styles',title:'Styles',summary:'Aggiunge groove, timbro, arrangiamento e dettagli di produzione.',how:'Usa gli Styles come ingredienti sonori e combinali liberamente.',example:'deep rolling bassline, warm pads, punchy drums, human groove.',selectors:['[data-sonara-suno-prompt="true"]']},
{id:'taxonomy',title:'Famiglia, genere e sottogenere',summary:'Definisce la grammatica musicale di base.',how:'Scegli famiglia, genere e sottogenere. Se il prompt specifica chiaramente uno stile differente, il prompt resta prioritario.',example:'Electronic / Dance → Drum & Bass → Jungle.',selectors:['[data-sonara-creator-block="taxonomy"]']},
{id:'musical',title:'Atmosfera, tonalità e durata',summary:'Controlla emozione, centro armonico e lunghezza.',how:'Atmosfera definisce il carattere, tonalità guida l’armonia e durata stabilisce lo sviluppo del brano.',example:'Dark Cinematic · A Minor · 240 secondi.',selectors:['[data-sonara-creator-block="musical"]']},
{id:'bpm',title:'BPM Auto / Manuale',summary:'Determina la velocità reale della generazione.',how:'Manuale blocca il valore scelto. Auto propone un tempo coerente. Se scrivi un BPM nel prompt, quel valore è autoritativo.',example:'170 BPM per Jungle/DnB · 124 BPM per House · 72 BPM per ballata.',selectors:['[data-sonara-creator-block="bpm"]','input[aria-label="BPM preferiti"]']},
{id:'weirdness',title:'Weirdness',summary:'Regola quanto il risultato può essere insolito e imprevedibile.',how:'Valori bassi sono più convenzionali. Valori alti aumentano sperimentazione timbrica, armonica e strutturale.',example:'25 = tradizionale · 55 = creativo · 85 = sperimentale.',selectors:['#sonara-weirdness']},
{id:'style',title:'Style Influence',summary:'Regola quanto fortemente SONARA segue lo stile selezionato.',how:'Aumentalo per più fedeltà al genere. Riducilo per più libertà e fusioni.',example:'90 = stile forte · 50 = equilibrio · 25 = interpretazione libera.',selectors:['#sonara-style-influence']},
{id:'vocals',title:'Voce',summary:'Sceglie se il brano è strumentale o cantato e quale voce usare.',how:'Seleziona Instrumental, Male, Female o Duet. Lingua e testo guidano l’esecuzione.',example:'Female + Italiano oppure Duet per alternanza uomo/donna.',selectors:['button[data-sonara-vocal-mode]']},
{id:'lyrics',title:'Testo / Lyrics',summary:'Contiene le parole che devono essere cantate.',how:'Scrivi il testo oppure usa gli strumenti intelligenti. Puoi indicare Verse, Chorus, Bridge e Outro.',example:'[Verse] … [Chorus] … [Bridge] … [Outro] …',selectors:['#sonara-lyrics']},
{id:'intelligent',title:'Prompt Intelligente',summary:'Espande una tua idea in un brief musicale professionale.',how:'Scrivi prima ciò che vuoi davvero, poi usa Intelligente per completare strumentazione, groove, armonia e produzione.',example:'Afro House malinconica con kora → brief completo mantenendo queste priorità.',selectors:['button[title="Prompt Intelligente SONARA"]','button[data-sonara-intelligent-prompt]']},
{id:'random',title:'Random / Inspo',summary:'Genera una nuova direzione creativa.',how:'Varia stile e ingredienti musicali senza cambiare un BPM esplicitamente bloccato.',example:'Premi Random più volte e scegli l’idea migliore.',selectors:['button[title="Random Style"]','button[data-sonara-random-style]']},
{id:'create',title:'Create / Genera',summary:'Avvia la generazione con tutte le impostazioni attive.',how:'Controlla Prompt, BPM, stile, voce, durata e testo prima di generare.',example:'Prompt pronto + 128 BPM + Female + 180 s → Create.',selectors:[]},
{id:'workspace',title:'Workspace e risultati',summary:'È l’area dove compaiono le tracce generate.',how:'Ascolta le versioni, confrontale e continua dalla migliore.',example:'Genera due versioni e scegli quella da scaricare o rifinire.',selectors:['[data-sonara-creator-workspace-host]']}
];
const findSection=()=>{const p=document.getElementById('sonara-prompt');return p&&p.closest('section')};
const createButton=s=>[...s.querySelectorAll('button')].find(b=>{const t=((b.textContent||'')+' '+(b.getAttribute('title')||'')+' '+(b.getAttribute('aria-label')||'')).trim().toLowerCase();return t==='create'||t.includes('genera')||t.includes('generate music')});
const target=(item,s)=>{if(item.id==='create')return createButton(s)||null;for(const q of item.selectors){const n=s.querySelector(q)||document.querySelector(q);if(n)return n}return null};
const holder=(item,n,s)=>{if(['prompt','taxonomy','musical','bpm'].includes(item.id)){let c=n;while(c&&c.parentElement&&c.parentElement!==s)c=c.parentElement;return c&&c.parentElement===s?c:n}if(item.id==='world')return n.closest('[data-sonara-global-suggestions-host],#sonara-world-suggestions-edge')||n.parentElement||n;if(item.id==='workspace')return n;if(item.id==='weirdness'||item.id==='style')return n.closest('label')||n.parentElement||n;return n.parentElement||n};
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pop=null;
const close=()=>{pop?.remove();pop=null};
const open=(item,b)=>{close();const r=b.getBoundingClientRect(),w=Math.min(360,innerWidth-24),left=Math.max(12,Math.min(r.right-w,innerWidth-w-12));pop=document.createElement('aside');pop.className='sonara-edge-help-pop';pop.innerHTML='<header><span class="seh-q">?</span><div><small>COME FUNZIONA</small><strong>'+esc(item.title)+'</strong></div><button type="button" class="seh-x">×</button></header><p class="seh-summary">'+esc(item.summary)+'</p><div class="seh-box"><b>Come si usa</b><p>'+esc(item.how)+'</p></div><div class="seh-example"><b>Esempio</b><p>'+esc(item.example)+'</p></div><button type="button" class="seh-full">Apri guida completa</button>';document.body.appendChild(pop);const h=pop.getBoundingClientRect().height;let top=r.bottom+8;if(top+h>innerHeight-12&&r.top>h)top=r.top-h-8;pop.style.left=left+'px';pop.style.top=Math.max(12,Math.min(top,innerHeight-h-12))+'px';pop.querySelector('.seh-x').onclick=close;pop.querySelector('.seh-full').onclick=()=>{close();const g=document.querySelector('.sonara-guide-open-button');if(g)g.click()};};
const mount=()=>{const s=findSection();if(!s)return;items.forEach(item=>{const n=target(item,s);if(!n)return;const h=holder(item,n,s);if(!(h instanceof HTMLElement))return;if(getComputedStyle(h).position==='static')h.style.position='relative';let b=h.querySelector(':scope > button[data-sonara-edge-help="'+item.id+'"]');if(!b){b=document.createElement('button');b.type='button';b.className='sonara-edge-help-tip';b.dataset.sonaraEdgeHelp=item.id;b.textContent='?';b.title=item.title+': '+item.summary;b.setAttribute('aria-label','Che cos’è '+item.title+'?');b.onclick=e=>{e.preventDefault();e.stopPropagation();open(item,b)};h.appendChild(b)}})};
const css=document.createElement('style');css.id='sonara-context-help-edge-css';css.textContent='.sonara-edge-help-tip{position:absolute!important;z-index:30!important;right:8px!important;top:8px!important;width:24px!important;height:24px!important;min-width:24px!important;padding:0!important;border:1px solid rgba(115,169,255,.38)!important;border-radius:999px!important;background:#171a22!important;color:#9fc4ff!important;font:900 11px/1 system-ui!important;cursor:help!important;box-shadow:0 5px 14px rgba(0,0,0,.22)!important}.sonara-edge-help-tip:hover{background:#246bc2!important;color:#fff!important}.sonara-edge-help-pop{position:fixed;z-index:2147483300;width:min(360px,calc(100vw - 24px));overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#111217;color:#f4f6fa;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}.sonara-edge-help-pop header{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.06);background:#15171d}.seh-q{display:flex;align-items:center;justify-content:center;width:31px;height:31px;border-radius:10px;background:rgba(45,119,225,.17);color:#83b8ff;font-weight:950}.sonara-edge-help-pop header>div{display:flex;flex-direction:column;gap:1px}.sonara-edge-help-pop header small{font-size:8px;font-weight:950;letter-spacing:.11em;color:#6da8ff}.sonara-edge-help-pop header strong{font-size:13px}.seh-x{margin-left:auto;width:30px;height:30px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#1b1d23;color:#abb1bc;font-size:18px;cursor:pointer}.seh-summary{margin:0;padding:13px 14px 7px;color:#c4c9d2;font-size:11.5px;line-height:1.55}.seh-box,.seh-example{margin:8px 12px;padding:10px 11px;border:1px solid rgba(255,255,255,.06);border-radius:11px;background:#181a20}.seh-box b,.seh-example b{display:block;margin-bottom:3px;font-size:10px}.seh-box p,.seh-example p{margin:0;color:#9fa7b4;font-size:10.5px;line-height:1.5}.seh-example{background:rgba(60,75,160,.08);border-color:rgba(96,126,255,.16)}.seh-full{width:calc(100% - 24px);min-height:38px;margin:10px 12px 12px;border:1px solid rgba(87,149,255,.25);border-radius:10px;background:rgba(41,105,204,.13);color:#cfe1ff;font-size:10.5px;font-weight:850;cursor:pointer}@media(max-width:760px){.sonara-edge-help-pop{left:10px!important;top:auto!important;bottom:10px!important;width:calc(100vw - 20px)}.sonara-edge-help-tip{width:23px!important;height:23px!important;min-width:23px!important}}';document.head.appendChild(css);document.addEventListener('click',e=>{if(pop&&!pop.contains(e.target)&&!e.target.closest?.('.sonara-edge-help-tip'))close()},true);document.addEventListener('keydown',e=>{if(e.key==='Escape')close()},true);const boot=()=>{mount();new MutationObserver(mount).observe(document.body||document.documentElement,{childList:true,subtree:true});[100,300,700,1400,2800].forEach(ms=>setTimeout(mount,ms))};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();</script>`;

function withHelpHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-context-help', HELP_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectHelp(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withHelpHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-context-help', HELP_VERSION);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', { element(el) { el.append(CONTEXT_HELP_SCRIPT, { html: true }); } }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const response = await brandRuntime.fetch(request, env, ctx);
    const url = new URL(request.url);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';
    if (!publicHost) return response;
    if (request.method === 'GET') return injectHelp(response);
    if (request.method === 'HEAD') return withHelpHeaders(response);
    return response;
  }
};
