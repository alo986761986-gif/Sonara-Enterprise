import brandRuntime from './sonara-brand-router.mjs';
export { SonaraJobState } from './sonara-brand-router.mjs';

const HELP_VERSION = 'creator-mini-help-v2';

const CONTEXT_HELP_SCRIPT = `<script id="sonara-context-help-edge-v2">(()=>{const items=[
{id:'prompt',title:'Prompt musica',summary:'Descrive il brano che SONARA deve creare.',how:'Scrivi genere, strumenti, atmosfera, voce e BPM.',example:'Jungle / DnB, rave dark, 170 BPM.',selectors:['#sonara-prompt']},
{id:'world',title:'Musica & Strumenti',summary:'Libreria di generi e strumenti da tutto il mondo.',how:'Cerca e clicca gli elementi per inserirli nel prompt.',example:'Afro House + Kora + Djembe.',selectors:['.sonara-global-suggestions-toggle','#sonara-world-suggestions-edge .swe-toggle']},
{id:'styles',title:'Styles',summary:'Aggiunge groove, timbro e dettagli di produzione.',how:'Combina più caratteristiche per definire il suono.',example:'deep bassline + warm pads.',selectors:['[data-sonara-suno-prompt="true"]']},
{id:'taxonomy',title:'Genere e sottogenere',summary:'Definisce la base musicale della generazione.',how:'Scegli famiglia, genere e sottogenere.',example:'Electronic → Drum & Bass → Jungle.',selectors:['[data-sonara-creator-block="taxonomy"]']},
{id:'musical',title:'Atmosfera, tonalità, durata',summary:'Controlla emozione, armonia e lunghezza.',how:'Imposta il carattere e quanto deve durare il brano.',example:'Dark · A Minor · 240 s.',selectors:['[data-sonara-creator-block="musical"]']},
{id:'bpm',title:'BPM Auto / Manuale',summary:'Controlla la velocità reale del brano.',how:'Manuale blocca il valore; Auto lo propone. Il BPM nel prompt ha priorità.',example:'170 BPM DnB · 124 BPM House.',selectors:['[data-sonara-creator-block="bpm"]','input[aria-label="BPM preferiti"]']},
{id:'weirdness',title:'Weirdness',summary:'Regola quanto il risultato può essere imprevedibile.',how:'Basso = più classico. Alto = più sperimentale.',example:'25 classico · 55 creativo · 85 estremo.',selectors:['#sonara-weirdness']},
{id:'style',title:'Style Influence',summary:'Regola quanto SONARA segue lo stile scelto.',how:'Alto = più fedele. Basso = più libero.',example:'90 fedele · 50 bilanciato · 25 libero.',selectors:['#sonara-style-influence']},
{id:'vocals',title:'Voce',summary:'Sceglie se il brano è strumentale o cantato.',how:'Seleziona Instrumental, Male, Female o Duet.',example:'Female + Italiano.',selectors:['button[data-sonara-vocal-mode]']},
{id:'lyrics',title:'Testo / Lyrics',summary:'Contiene le parole che devono essere cantate.',how:'Scrivi il testo o usa gli strumenti intelligenti.',example:'[Verse] … [Chorus] …',selectors:['#sonara-lyrics']},
{id:'intelligent',title:'Prompt Intelligente',summary:'Espande una breve idea in un prompt professionale.',how:'Scrivi l’idea principale e lascia a SONARA i dettagli.',example:'Afro House malinconica con kora.',selectors:['button[title="Prompt Intelligente SONARA"]','button[data-sonara-intelligent-prompt]']},
{id:'random',title:'Random / Inspo',summary:'Propone una nuova direzione creativa.',how:'Usalo per ottenere subito un’idea diversa.',example:'Premi più volte e scegli la migliore.',selectors:['button[title="Random Style"]','button[data-sonara-random-style]']},
{id:'create',title:'Create / Genera',summary:'Avvia la generazione con le impostazioni attive.',how:'Controlla prompt, BPM, stile, voce e durata.',example:'Prompt + 128 BPM + Female → Create.',selectors:[]},
{id:'workspace',title:'Workspace',summary:'Mostra le tracce generate.',how:'Ascolta e confronta le versioni.',example:'Scegli la traccia migliore.',selectors:['[data-sonara-creator-workspace-host]']}
];
const section=()=>{const p=document.getElementById('sonara-prompt');return p&&p.closest('section')};
const createButton=s=>[...s.querySelectorAll('button')].find(b=>{const t=((b.textContent||'')+' '+(b.title||'')+' '+(b.getAttribute('aria-label')||'')).trim().toLowerCase();return t==='create'||t.includes('genera')||t.includes('generate music')});
const target=(item,s)=>{if(item.id==='create')return createButton(s)||null;for(const q of item.selectors){const n=s.querySelector(q)||document.querySelector(q);if(n)return n}return null};
const holder=(item,n,s)=>{if(['prompt','taxonomy','musical','bpm'].includes(item.id)){let c=n;while(c&&c.parentElement&&c.parentElement!==s)c=c.parentElement;return c&&c.parentElement===s?c:n}if(item.id==='world')return n.closest('[data-sonara-global-suggestions-host],#sonara-world-suggestions-edge')||n.parentElement||n;if(item.id==='workspace')return n;if(item.id==='weirdness'||item.id==='style')return n.closest('label')||n.parentElement||n;return n.parentElement||n};
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pop=null;const close=()=>{pop?.remove();pop=null};
const open=(item,b)=>{close();const r=b.getBoundingClientRect(),w=Math.min(286,innerWidth-20);pop=document.createElement('aside');pop.className='sonara-mini-help-pop';pop.innerHTML='<header><strong>'+esc(item.title)+'</strong><button type="button" class="smh-x" aria-label="Chiudi">×</button></header><p>'+esc(item.summary)+'</p><div><b>Uso:</b> '+esc(item.how)+'</div><small><b>Esempio:</b> '+esc(item.example)+'</small>';document.body.appendChild(pop);const h=pop.getBoundingClientRect().height;let top=r.bottom+7;if(top+h>innerHeight-10&&r.top>h)top=r.top-h-7;pop.style.left=Math.max(10,Math.min(r.right-w,innerWidth-w-10))+'px';pop.style.top=Math.max(10,Math.min(top,innerHeight-h-10))+'px';pop.querySelector('.smh-x').onclick=close};
const mount=()=>{const s=section();if(!s)return;document.querySelectorAll('.sonara-edge-help-pop,.sonara-suno-help-popover,.sonara-guide-backdrop').forEach(n=>n.remove());const oldGuide=document.querySelector('.sonara-guide-open-button');if(oldGuide)oldGuide.style.display='none';items.forEach(item=>{const n=target(item,s);if(!n)return;const h=holder(item,n,s);if(!(h instanceof HTMLElement))return;if(getComputedStyle(h).position==='static')h.style.position='relative';let b=h.querySelector(':scope > button[data-sonara-mini-help="'+item.id+'"]');if(!b){b=document.createElement('button');b.type='button';b.className='sonara-mini-help-tip';b.dataset.sonaraMiniHelp=item.id;b.textContent='?';b.title=item.title;b.setAttribute('aria-label','Info '+item.title);b.onclick=e=>{e.preventDefault();e.stopPropagation();open(item,b)};h.appendChild(b)}})};
const css=document.createElement('style');css.id='sonara-context-help-edge-css-v2';css.textContent='.sonara-guide-open-button,.sonara-inline-guide-tip,.sonara-suno-help-tip,.sonara-edge-help-tip{display:none!important}.sonara-mini-help-tip{position:absolute!important;z-index:30!important;right:8px!important;top:8px!important;width:22px!important;height:22px!important;min-width:22px!important;padding:0!important;border:1px solid rgba(115,169,255,.32)!important;border-radius:999px!important;background:#171a22!important;color:#9fc4ff!important;font:900 10px/1 system-ui!important;cursor:pointer!important;box-shadow:0 3px 10px rgba(0,0,0,.2)!important}.sonara-mini-help-tip:hover{background:#236bc2!important;color:#fff!important}.sonara-mini-help-pop{position:fixed;z-index:2147483400;width:min(286px,calc(100vw - 20px));overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#121318;color:#f4f6fa;box-shadow:0 14px 38px rgba(0,0,0,.46);font-family:Inter,system-ui,sans-serif}.sonara-mini-help-pop header{display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.055);background:#17181e}.sonara-mini-help-pop header strong{min-width:0;flex:1;font-size:11.5px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.smh-x{width:24px;height:24px;min-width:24px;padding:0;border:0;border-radius:7px;background:#202229;color:#aeb4bf;font-size:16px;cursor:pointer}.smh-x:hover{background:#2a2d35;color:#fff}.sonara-mini-help-pop>p{margin:0;padding:9px 10px 5px;color:#c7ccd5;font-size:10.5px;line-height:1.45}.sonara-mini-help-pop>div{margin:4px 10px;padding:7px 8px;border-radius:8px;background:#191b21;color:#aeb5c0;font-size:9.8px;line-height:1.4}.sonara-mini-help-pop>small{display:block;padding:5px 10px 10px;color:#8993a2;font-size:9.3px;line-height:1.35}.sonara-mini-help-pop b{color:#e8ebf0;font-weight:850}@media(max-width:760px){.sonara-mini-help-pop{width:min(270px,calc(100vw - 20px))}.sonara-mini-help-tip{width:21px!important;height:21px!important;min-width:21px!important}}';document.head.appendChild(css);document.addEventListener('click',e=>{if(pop&&!pop.contains(e.target)&&!e.target.closest?.('.sonara-mini-help-tip'))close()},true);document.addEventListener('keydown',e=>{if(e.key==='Escape')close()},true);const boot=()=>{mount();new MutationObserver(mount).observe(document.body||document.documentElement,{childList:true,subtree:true});[100,300,700,1400,2800].forEach(ms=>setTimeout(mount,ms))};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();</script>`;

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
