import webRuntime from './sonara-web-v15-router.mjs';
export { SonaraJobState } from './sonara-web-v15-router.mjs';

const BRAND_ICON_PATH = '/sonara-brand-icon.svg';
const BRAND_ICON = `${BRAND_ICON_PATH}?v=20260829-5`;
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-4';
const BRAND_VERSION = 'sonic-s-v5';
const SEO_TITLE = 'SONARA AI MUSIC PLATFORM';
const SEO_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const MUSIC_GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const BPM_MIN = 40;
const BPM_MAX = 220;

const PROMPT_STYLE_RULES = [
  { pattern: /\b(?:liquid\s+)?drum\s*(?:&|and)\s*bass\b|\bdnb\b/i, family: 'Electronic / Dance', genre: 'Drum & Bass', subgenre: 'Drum & Bass' },
  { pattern: /\bjungle\b/i, family: 'Electronic / Dance', genre: 'Drum & Bass', subgenre: 'Jungle' },
  { pattern: /\bhard\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Hard Techno' },
  { pattern: /\bindustrial\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Industrial Techno' },
  { pattern: /\bdetroit\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Detroit Techno' },
  { pattern: /\bdub\s*techno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Dub Techno' },
  { pattern: /\btechno\b/i, family: 'Electronic / Dance', genre: 'Techno', subgenre: 'Techno' },
  { pattern: /\btech\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Tech House' },
  { pattern: /\bdeep\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House' },
  { pattern: /\bafro\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Afro House' },
  { pattern: /\bprogressive\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Progressive House' },
  { pattern: /\bacid\s*house\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'Acid House' },
  { pattern: /\bhouse\b/i, family: 'Electronic / Dance', genre: 'House', subgenre: 'House' },
  { pattern: /\bpsy(?:chedelic)?\s*trance\b|\bgoa\s*trance\b/i, family: 'Electronic / Dance', genre: 'Trance', subgenre: 'Psytrance' },
  { pattern: /\btrance\b/i, family: 'Electronic / Dance', genre: 'Trance', subgenre: 'Trance' },
  { pattern: /\bdubstep\b/i, family: 'Electronic / Dance', genre: 'Bass Music', subgenre: 'Dubstep' },
  { pattern: /\bamapiano\b/i, family: 'Electronic / Dance', genre: 'Amapiano', subgenre: 'Amapiano' },
  { pattern: /\bboom\s*bap\b/i, family: 'Hip-Hop / Rap', genre: 'Hip-Hop', subgenre: 'Boom Bap' },
  { pattern: /\buk\s*drill\b|\bdrill\b/i, family: 'Hip-Hop / Rap', genre: 'Drill', subgenre: 'UK Drill' },
  { pattern: /\btrap\b/i, family: 'Hip-Hop / Rap', genre: 'Trap', subgenre: 'Trap' },
  { pattern: /\bhip[- ]?hop\b|\brap\b/i, family: 'Hip-Hop / Rap', genre: 'Hip-Hop', subgenre: 'Hip-Hop' },
  { pattern: /\bblack\s*metal\b/i, family: 'Rock / Metal', genre: 'Metal', subgenre: 'Black Metal' },
  { pattern: /\bdoom\s*metal\b/i, family: 'Rock / Metal', genre: 'Metal', subgenre: 'Doom Metal' },
  { pattern: /\bmetal\b/i, family: 'Rock / Metal', genre: 'Metal', subgenre: 'Metal' },
  { pattern: /\bpost[- ]?rock\b/i, family: 'Rock / Metal', genre: 'Rock', subgenre: 'Post-Rock' },
  { pattern: /\brock\b/i, family: 'Rock / Metal', genre: 'Rock', subgenre: 'Rock' },
  { pattern: /\bbebop\b/i, family: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Bebop' },
  { pattern: /\bjazz\s*fusion\b/i, family: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Jazz Fusion' },
  { pattern: /\bjazz\b/i, family: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Jazz' },
  { pattern: /\breggae\b/i, family: 'Reggae / Caribbean', genre: 'Reggae', subgenre: 'Reggae' },
  { pattern: /\bafrobeats\b/i, family: 'African', genre: 'Afrobeats', subgenre: 'Afrobeats' },
  { pattern: /\bafrobeat\b/i, family: 'African', genre: 'Afrobeat', subgenre: 'Afrobeat' },
  { pattern: /\bambient\b/i, family: 'Ambient / Experimental', genre: 'Ambient', subgenre: 'Ambient' },
  { pattern: /\bpop\b/i, family: 'Pop', genre: 'Pop', subgenre: 'Pop' }
];

function parsePromptBpm(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/\b(?:at|a|@|tempo\s*[:=]?\s*)?(\d{2,3})\s*bpm\b/i)
    || text.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
  if (!match) return null;
  const valueNumber = Number(match[1]);
  if (!Number.isFinite(valueNumber)) return null;
  return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, valueNumber)));
}

function detectPromptStyle(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return PROMPT_STYLE_RULES.find(rule => rule.pattern.test(text)) || null;
}

function tempoMotionInstruction(bpm) {
  if (bpm >= 160) {
    return `FULL-TIME FAST MOTION LOCK: the music must be audibly fast at ${bpm} BPM, not merely tagged with that metadata. Do not render an ${Math.round(bpm / 2)} BPM half-time feel. Keep the primary drum grid, bass rhythm, hats/percussion, phrase pacing and transitions moving at the perceptual speed of ${bpm} BPM, with genre-authentic eighth-note and sixteenth-note activity.`;
  }
  if (bpm >= 130) {
    return `UPTEMPO MOTION LOCK: preserve a clearly energetic full-time pulse at ${bpm} BPM. Do not slow the perceived groove through half-time reinterpretation unless the creator explicitly requests half-time.`;
  }
  return `TEMPO MOTION LOCK: the audible groove and phrase pacing must correspond to exactly ${bpm} BPM for the entire rendered track.`;
}

async function enforceCreatorMusicIntent(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !MUSIC_GENERATE_PATHS.has(url.pathname)) return request;
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return request;

  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return request;

    const creatorPrompt = String(body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt || '').trim();
    const visiblePrompt = String(body.prompt || '').trim();
    const promptSource = creatorPrompt || visiblePrompt;
    const explicitBpm = parsePromptBpm(creatorPrompt) ?? parsePromptBpm(visiblePrompt);
    const explicitStyle = detectPromptStyle(promptSource);
    let next = { ...body };

    if (explicitStyle) {
      next = {
        ...next,
        genreFamily: explicitStyle.family,
        genre: explicitStyle.genre,
        subgenre: explicitStyle.subgenre,
        promptGenreAuthoritative: true,
        sonaraCreatorStylePriority: true,
        sonaraEdgeStyleLock: 'creator-prompt-v3'
      };
    }

    if (explicitBpm !== null) {
      const lock = [
        `SONARA HARD TEMPO LOCK: exactly ${explicitBpm} BPM.`,
        `CREATOR BPM PRIORITY: ${explicitBpm} BPM was explicitly written by the creator and overrides every UI default, automatic genre tempo, metadata fallback or previously inferred BPM.`,
        tempoMotionInstruction(explicitBpm),
        `Ignore any conflicting BPM number that appears later in inherited or fallback production text; ${explicitBpm} BPM is the only authoritative render tempo.`
      ].join(' ');
      next = {
        ...next,
        bpm: explicitBpm,
        requestedBpm: explicitBpm,
        targetBpm: explicitBpm,
        preferredBpm: explicitBpm,
        promptBpmAuthoritative: true,
        bpmLock: true,
        sonaraEdgeTempoLock: 'creator-prompt-v3',
        prompt: `${lock}\n\n${visiblePrompt}`.slice(0, 12000)
      };
    }

    if (next === body || (!explicitStyle && explicitBpm === null)) return request;
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    if (explicitBpm !== null) headers.set('x-sonara-bpm-lock', `creator-prompt-${explicitBpm}`);
    if (explicitStyle) headers.set('x-sonara-style-lock', `creator-prompt-${explicitStyle.subgenre}`);
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(next),
      redirect: request.redirect
    });
  } catch {
    return request;
  }
}

const BRAND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">
  <title id="title">SONARA</title>
  <desc id="desc">SONARA sonic S logo</desc>
  <defs>
    <linearGradient id="sonaraBlue" x1="30" y1="30" x2="225" y2="225" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0b4dff"/>
      <stop offset="0.42" stop-color="#009dff"/>
      <stop offset="0.76" stop-color="#12e6ff"/>
      <stop offset="1" stop-color="#3df6ff"/>
    </linearGradient>
    <linearGradient id="sonaraDeep" x1="220" y1="55" x2="40" y2="205" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3cf5ff"/>
      <stop offset="0.28" stop-color="#0aa8ff"/>
      <stop offset="0.62" stop-color="#0755ff"/>
      <stop offset="1" stop-color="#07298f"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="256" height="256" rx="48" fill="#02050b"/>
  <circle cx="128" cy="128" r="104" fill="#071731" opacity=".28"/>
  <g filter="url(#glow)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M42 82C61 35 118 22 169 36c24 7 43 20 55 36-30-17-63-23-94-16-31 7-50 27-47 49 2 16 14 28 34 35" stroke="url(#sonaraBlue)" stroke-width="28"/>
    <path d="M139 124c24 7 39 21 41 39 2 20-11 38-34 48-32 15-74 7-104-17 31 13 64 13 86 0 20-12 28-31 21-47-4-9-11-17-21-23" stroke="url(#sonaraDeep)" stroke-width="28"/>
  </g>
  <g filter="url(#glow)" stroke="url(#sonaraBlue)" stroke-width="6" stroke-linecap="round">
    <line x1="76" y1="125" x2="76" y2="133"/><line x1="88" y1="118" x2="88" y2="140"/>
    <line x1="100" y1="108" x2="100" y2="150"/><line x1="112" y1="96" x2="112" y2="162"/>
    <line x1="124" y1="78" x2="124" y2="180"/><line x1="136" y1="92" x2="136" y2="166"/>
    <line x1="148" y1="105" x2="148" y2="153"/><line x1="160" y1="114" x2="160" y2="144"/>
    <line x1="172" y1="121" x2="172" y2="137"/><line x1="184" y1="126" x2="184" y2="132"/>
  </g>
</svg>`;

const HEADER_BRAND_SCRIPT = `<script id="sonara-header-brand-v5-safe">(()=>{const icon=${JSON.stringify(BRAND_ICON)};const isBrandIcon=src=>{try{return new URL(src||'',location.origin).pathname==='/sonara-brand-icon.svg'}catch{return String(src||'').includes('/sonara-brand-icon.svg')}};let scheduled=false;const apply=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;document.querySelectorAll('header').forEach(header=>{const label=[...header.querySelectorAll('h1,h2,span,div')].find(el=>el.children.length===0&&(el.textContent||'').trim().toUpperCase()==='SONARA ENTERPRISE');if(!label)return;const group=label.parentElement;const row=group&&group.parentElement?group.parentElement:group;let img=(row&&row.querySelector('img'))||header.querySelector('img[src*="sonara-ai-icon"],img[alt*="SONARA"],img[data-sonara-brand-logo="true"]');if(!img&&row){img=document.createElement('img');row.insertBefore(img,row.firstChild);}if(img){if(!isBrandIcon(img.getAttribute('src')))img.setAttribute('src',icon);if(img.getAttribute('alt')!=='SONARA Enterprise')img.setAttribute('alt','SONARA Enterprise');img.setAttribute('width','44');img.setAttribute('height','44');img.setAttribute('data-sonara-brand-logo','true');img.setAttribute('loading','eager');img.style.width='44px';img.style.height='44px';img.style.objectFit='contain';img.style.borderRadius='12px';img.style.flex='0 0 auto';}});});};const releaseBoot=()=>document.querySelectorAll('[aria-label="SONARA boot animation"],[data-sonara-boot="active"]').forEach(el=>{el.style.pointerEvents='none';el.style.opacity='0';setTimeout(()=>el.remove(),120)});const start=()=>{apply();new MutationObserver(apply).observe(document.body||document.documentElement,{childList:true,subtree:true});[100,350,800,1500,3000].forEach(ms=>setTimeout(apply,ms));setTimeout(releaseBoot,2700);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();})();</script>`;

const PROMPT_TEMPO_SYNC_SCRIPT = `<script id="sonara-prompt-tempo-sync-v3">(()=>{const parse=t=>{t=String(t||'');const m=t.match(/\\b(?:at|a|@|tempo\\s*[:=]?\\s*)?(\\d{2,3})\\s*bpm\\b/i)||t.match(/\\bbpm\\s*[:=]?\\s*(\\d{2,3})\\b/i);if(!m)return null;const n=Math.round(Number(m[1]));return Number.isFinite(n)&&n>=40&&n<=220?n:null};const apply=()=>{const p=document.getElementById('sonara-prompt');if(!(p instanceof HTMLTextAreaElement))return;const bpm=parse(p.value);if(!bpm)return;const s=p.closest('section');const i=s&&s.querySelector('input[aria-label="BPM preferiti"]');if(!(i instanceof HTMLInputElement))return;if(Number(i.value)!==bpm){const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(i,String(bpm));else i.value=String(bpm)}i.dataset.sonaraPromptBpm=String(bpm);i.dataset.sonaraPromptBpmAuthoritative='true';};const schedule=()=>[0,140,280,520].forEach(ms=>setTimeout(apply,ms));document.addEventListener('input',e=>{if(e.target&&e.target.id==='sonara-prompt')schedule()},true);window.addEventListener('sonara:bpm-mode',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();})();</script>`;

const GLOBAL_WORLD_SUGGESTIONS_SCRIPT = `<script id="sonara-global-world-suggestions-edge-v1">(()=>{const G=(label,items)=>({label,items:items.split('|').map(v=>v.trim()).filter(Boolean)});const music=[G('Electronic & Dance','House|Deep House|Tech House|Progressive House|Afro House|Organic House|Soulful House|Funky House|Acid House|Chicago House|French House|Electro House|Future House|Bass House|Melodic House|Tropical House|Techno|Detroit Techno|Minimal Techno|Dub Techno|Industrial Techno|Hard Techno|Acid Techno|Melodic Techno|Trance|Progressive Trance|Uplifting Trance|Psytrance|Goa Trance|Tech Trance|Hard Trance|Vocal Trance|Drum & Bass|Liquid Drum & Bass|Neurofunk|Jungle|Breakbeat|Breaks|UK Garage|2-Step Garage|Speed Garage|Dubstep|Brostep|Future Garage|Future Bass|Trap EDM|Glitch Hop|Electro|Electroclash|EDM|Big Room|Hardstyle|Rawstyle|Hardcore Techno|Gabber|Frenchcore|Happy Hardcore|Eurodance|Italo Dance|Disco|Nu-Disco|Hi-NRG|Boogie|Electronica|IDM|Glitch|Downtempo|Chillout|Trip Hop|Lounge|Ambient House|Ambient Techno|Vaporwave|Synthwave|Retrowave|Darkwave|Chillwave|Lo-Fi Beats'),G('Pop & Contemporary','Pop|Contemporary Pop|Dance Pop|Electropop|Synthpop|Indie Pop|Dream Pop|Art Pop|Chamber Pop|Power Pop|Bubblegum Pop|Sunshine Pop|Sophisti-Pop|Hyperpop|Bedroom Pop|City Pop|J-Pop|K-Pop|C-Pop|Mandopop|Cantopop|Europop|Italo Pop|French Pop|Latin Pop|Arabic Pop|Afropop|Adult Contemporary|Easy Listening|Singer-Songwriter|Canzone Napoletana|Neomelodico Napoletano'),G('Hip-Hop, R&B & Urban','Hip-Hop|Rap|Boom Bap|East Coast Hip-Hop|West Coast Hip-Hop|Southern Hip-Hop|G-Funk|Gangsta Rap|Conscious Hip-Hop|Alternative Hip-Hop|Experimental Hip-Hop|Jazz Rap|Lo-Fi Hip-Hop|Trap|Drill|UK Drill|Brooklyn Drill|Chicago Drill|Cloud Rap|Emo Rap|Grime|Crunk|Phonk|Memphis Rap|R&B|Contemporary R&B|Neo Soul|Quiet Storm|New Jack Swing|Soul|Motown|Northern Soul|Funk|P-Funk|Go-Go|Afroswing|Amapiano|Gqom|Kwaito|Afrobeats|Alté'),G('Rock, Metal & Punk','Rock|Classic Rock|Alternative Rock|Indie Rock|Garage Rock|Hard Rock|Soft Rock|Arena Rock|Art Rock|Progressive Rock|Psychedelic Rock|Surf Rock|Southern Rock|Blues Rock|Folk Rock|Country Rock|Glam Rock|Post-Rock|Shoegaze|Noise Rock|Math Rock|Grunge|Britpop|Emo|Screamo|Post-Hardcore|Punk Rock|Pop Punk|Hardcore Punk|Post-Punk|Anarcho-Punk|Garage Punk|Skate Punk|Oi!|Metal|Heavy Metal|Thrash Metal|Death Metal|Melodic Death Metal|Black Metal|Doom Metal|Sludge Metal|Stoner Metal|Power Metal|Symphonic Metal|Progressive Metal|Folk Metal|Nu Metal|Metalcore|Deathcore|Industrial Metal|Gothic Metal|Alternative Metal|Djent|Speed Metal|Grindcore'),G('Jazz, Blues, Soul & Gospel','Jazz|Traditional Jazz|Dixieland|Swing|Big Band|Bebop|Hard Bop|Cool Jazz|Modal Jazz|Free Jazz|Avant-Garde Jazz|Jazz Fusion|Smooth Jazz|Latin Jazz|Afro-Cuban Jazz|Gypsy Jazz|Vocal Jazz|Nu Jazz|Acid Jazz|Blues|Delta Blues|Chicago Blues|Texas Blues|Piedmont Blues|Electric Blues|Jump Blues|Rhythm & Blues|Gospel Blues|Soul Jazz|Funk Jazz|Gospel|Southern Gospel|Spirituals'),G('Classical & Art Music','Medieval Music|Gregorian Chant|Renaissance Music|Baroque|Classical Period|Viennese Classicism|Romantic|Late Romantic|Impressionism|Expressionism|Modern Classical|Contemporary Classical|Neoclassical|Minimalism|Post-Minimalism|Serialism|Twelve-Tone|Aleatoric Music|Spectral Music|Electroacoustic|Musique Concrète|Opera|Operetta|Oratorio|Cantata|Mass|Requiem|Symphony|Concerto|Chamber Music|String Quartet|Piano Sonata|Art Song|Lieder|Choral Music|Ballet Music|March|Waltz|Polka'),G('Latin America & Caribbean','Salsa|Salsa Dura|Timba|Son Cubano|Mambo|Cha-Cha-Chá|Rumba Cubana|Bolero|Guaracha|Danzón|Merengue|Bachata|Reggaeton|Dembow|Latin Trap|Cumbia|Cumbia Colombiana|Cumbia Sonidera|Cumbia Villera|Vallenato|Champeta|Samba|Bossa Nova|MPB|Forró|Baião|Axé|Pagode|Sertanejo|Choro|Tropicália|Funk Carioca|Tango|Milonga|Chamamé|Nueva Canción|Cueca|Huayno|Marinera|Joropo|Bambuco|Reggae|Roots Reggae|Dub|Dancehall|Ska|Rocksteady|Calypso|Soca|Zouk|Kompa'),G('Africa','Highlife|Palm-Wine Music|Afrobeat|Afrobeats|Jùjú|Fuji|Apala|Gospel Highlife|Amapiano|Gqom|Kwaito|Maskandi|Mbaqanga|Marabi|Kwela|Township Jazz|Soukous|Congo Rumba|Ndombolo|Makossa|Bikutsi|Mbalax|Gnawa|Raï|Chaabi|Taarab|Bongo Flava|Ethio-Jazz|Tizita|Azmari|Desert Blues|Tuareg Music|Manding Music|Griot Music|Wassoulou|Morna|Funana|Sega|Maloya|Kizomba|Kuduro'),G('Middle East, North Africa & Central Asia','Arabic Classical Music|Tarab|Maqam Music|Andalusian Classical Music|Muwashshah|Dabke|Khaliji|Shaabi|Mahraganat|Raï|Gnawa|Persian Classical Music|Radif|Persian Pop|Kurdish Folk|Turkish Classical Music|Turkish Folk|Arabesque|Anatolian Rock|Azerbaijani Mugham|Armenian Folk|Georgian Polyphony|Kazakh Folk|Uzbek Shashmaqam|Tajik Shashmaqam|Kyrgyz Folk|Turkmen Folk|Mongolian Long Song|Tuvan Throat Singing'),G('South Asia','Hindustani Classical|Carnatic Classical|Dhrupad|Khayal|Thumri|Ghazal|Qawwali|Bhajan|Kirtan|Bollywood|Filmi|Bhangra|Punjabi Folk|Baul|Rabindra Sangeet|Nazrul Geeti|Lavani|Marathi Folk|Gujarati Garba|Rajasthani Folk|Bhojpuri Folk|Assamese Folk|Kashmiri Folk|Sufi Rock|Indian Pop|Desi Hip-Hop|Sri Lankan Baila|Nepali Folk|Pakistani Pop'),G('East Asia','Gagaku|Shōmyō|Minyō|Enka|Kayōkyoku|J-Pop|J-Rock|Visual Kei|Shibuya-kei|City Pop|Korean Court Music|Gugak|Pansori|Samulnori|Trot|K-Pop|K-R&B|K-Hip-Hop|Chinese Classical Music|Guoyue|Jiangnan Sizhu|Peking Opera|Kunqu|Mandopop|Cantopop|Taiwanese Pop|Hakka Music|Mongolian Folk|Morin Khuur Music'),G('Southeast Asia & Oceania','Gamelan|Keroncong|Dangdut|Campursari|Sundanese Music|Kulintang|Rondalla|OPM|Manila Sound|Thai Classical Music|Luk Thung|Mor Lam|Khmer Classical Music|Pinpeat|Vietnamese Ca Trù|Nhã Nhạc|Vietnamese Pop|Burmese Classical Music|Malay Gamelan|Dikir Barat|Hawaiian Music|Slack-Key Guitar|Hula Music|Māori Waiata|Pacific Island Music|Aboriginal Australian Music|Didgeridoo Drone|Australian Bush Music'),G('European Folk & Traditional','Irish Traditional|Scottish Traditional|Celtic|English Folk|Welsh Folk|Breton Music|Galician Folk|Fado|Flamenco|Sevillanas|Basque Folk|Musette|Chanson Française|Italian Folk|Tarantella|Pizzica|Tammurriata|Canzone Napoletana|Neomelodico Napoletano|Alpine Folk|Schlager|Klezmer|Balkan Brass|Romani Music|Rebetiko|Greek Folk|Sevdalinka|Turbo-Folk|Romanian Lăutărească|Hungarian Folk|Polish Folk|Mazurka|Polonaise|Czech Folk|Slovak Folk|Russian Folk|Ukrainian Folk|Nordic Folk|Swedish Polska|Finnish Folk|Joik|Icelandic Folk'),G('Country, Folk & Roots','Country|Traditional Country|Honky-Tonk|Outlaw Country|Nashville Sound|Country Pop|Americana|Bluegrass|Old-Time|Appalachian Folk|Western Swing|Cajun|Zydeco|Tejano|Norteño|Ranchera|Mariachi|Corridos|Folk|Contemporary Folk|Indie Folk|Folk Pop|Folk Punk|Roots Rock'),G('Ambient, Experimental & Cinematic','Ambient|Dark Ambient|Drone|Space Ambient|New Age|Meditation Music|Nature Soundscape|Experimental|Avant-Garde|Noise|Harsh Noise|Industrial|EBM|Power Electronics|Electroacoustic|Musique Concrète|Sound Art|Field Recording|Minimalism|Lowercase|Microsound|Glitch|Cinematic|Film Score|TV Score|Video Game Music|Trailer Music|Epic Orchestral|Hybrid Orchestral|Horror Score|Sci-Fi Score|Fantasy Score|Documentary Score|Musical Theatre|Cabaret|Vaudeville')];const instruments=[G('Strings, Guitars & Plucked Strings','Violin|Viola|Cello|Double Bass|Harp|Classical Guitar|Acoustic Guitar|Steel-String Guitar|12-String Guitar|Electric Guitar|Baritone Guitar|Bass Guitar|Fretless Bass|Upright Bass|Mandolin|Mandola|Mandocello|Banjo|Ukulele|Lap Steel Guitar|Pedal Steel Guitar|Resonator Guitar|Dobro|Lute|Theorbo|Archlute|Vihuela|Cittern|Zither|Autoharp|Hammered Dulcimer|Mountain Dulcimer|Balalaika|Domra|Bouzouki|Baglama|Oud|Saz|Tar|Setar|Tanbur|Rubab|Sitar|Sarod|Veena|Surbahar|Tanpura|Santoor|Koto|Shamisen|Biwa|Gayageum|Geomungo|Pipa|Ruan|Sanxian|Guzheng|Đàn Tranh|Đàn Bầu|Đàn Nguyệt|Erhu|Zhonghu|Gaohu|Morin Khuur|Kamancheh|Sarangi|Esraj|Dilruba|Hardanger Fiddle|Nyckelharpa'),G('Pianos, Keyboards & Organs','Grand Piano|Upright Piano|Prepared Piano|Electric Piano|Rhodes|Wurlitzer Electric Piano|Clavinet|Harpsichord|Clavichord|Celesta|Pipe Organ|Hammond Organ|Reed Organ|Positive Organ|Accordion|Piano Accordion|Button Accordion|Bandoneon|Concertina|Harmonium|Melodica|Toy Piano'),G('Synthesizers & Electronic Instruments','Analog Synthesizer|Digital Synthesizer|Modular Synthesizer|Semi-Modular Synthesizer|FM Synthesizer|Wavetable Synthesizer|Granular Synthesizer|Additive Synthesizer|Subtractive Synthesizer|Sampler|Drum Machine|Groovebox|Mellotron|Theremin|Ondes Martenot|Trautonium|Stylophone|Electronic Wind Instrument|Talkbox|Vocoder|Turntables|Tape Loops'),G('Woodwinds','Flute|Piccolo|Alto Flute|Bass Flute|Recorder|Soprano Recorder|Alto Recorder|Pan Flute|Ocarina|Tin Whistle|Irish Flute|Native American Flute|Shakuhachi|Xiao|Dizi|Bansuri|Quena|Ney|Kaval|Duduk|Zurna|Shawm|Oboe|English Horn|Oboe d’amore|Bassoon|Contrabassoon|Clarinet|Bass Clarinet|Contrabass Clarinet|Soprano Saxophone|Alto Saxophone|Tenor Saxophone|Baritone Saxophone|Bass Saxophone|Sopranino Saxophone|Harmonica|Bass Harmonica|Jaw Harp'),G('Brass','Trumpet|Piccolo Trumpet|Cornet|Flugelhorn|French Horn|Trombone|Bass Trombone|Valve Trombone|Euphonium|Baritone Horn|Tuba|Sousaphone|Bugle|Alphorn|Didgeridoo|Shofar|Conch Shell Trumpet'),G('Drums & Orchestral Percussion','Drum Kit|Kick Drum|Snare Drum|Tom-Toms|Floor Tom|Hi-Hat|Ride Cymbal|Crash Cymbal|China Cymbal|Splash Cymbal|Timpani|Concert Bass Drum|Concert Snare Drum|Cymbals|Triangle|Tambourine|Gong|Tam-Tam|Tubular Bells|Glockenspiel|Xylophone|Marimba|Vibraphone|Crotales|Celesta Bells|Woodblock|Temple Blocks|Claves|Guiro|Ratchet|Castanets'),G('Latin & Caribbean Percussion','Congas|Bongos|Timbales|Cajón|Claves|Guiro|Maracas|Cabasa|Agogô|Surdo|Repinique|Tamborim|Cuíca|Pandeiro|Berimbau|Shekere|Batá Drums|Cowbell|Steelpan|Quijada|Güira|Bombo Legüero'),G('African Percussion','Djembe|Dunun|Talking Drum|Udu|Shekere|Balafon|Kalimba|Mbira|Kora|Ngoni|Axatse|Gankogui|Bougarabou|Sabar|Tama|Ashiko|Bendir|Darbuka|Frame Drum'),G('Middle Eastern & Central Asian Instruments','Oud|Qanun|Ney|Darbuka|Daf|Riq|Bendir|Saz|Baglama|Kemençe|Kamancheh|Santur|Tar|Setar|Tanbur|Rubab|Duduk|Zurna|Kaval|Qopuz|Dombra|Komuz|Doira|Surnay'),G('South Asian Instruments','Sitar|Sarod|Tanpura|Surbahar|Veena|Saraswati Veena|Rudra Veena|Vichitra Veena|Santoor|Sarangi|Esraj|Dilruba|Tabla|Pakhawaj|Mridangam|Ghatam|Kanjira|Morsing|Dhol|Dholak|Dholki|Tumbi|Ektara|Bansuri|Shehnai|Nadaswaram|Harmonium|Swarmandal'),G('East Asian Instruments','Koto|Shamisen|Biwa|Shakuhachi|Taiko|Tsuzumi|Sho|Hichiriki|Ryuteki|Erhu|Zhonghu|Gaohu|Pipa|Ruan|Sanxian|Guzheng|Yangqin|Dizi|Xiao|Suona|Sheng|Guqin|Gayageum|Geomungo|Haegeum|Daegeum|Janggu|Buk|Kkwaenggwari|Morin Khuur'),G('Southeast Asian & Oceanic Instruments','Gamelan Gong|Metallophone|Saron|Gender|Bonang|Kendang|Angklung|Kulintang|Agung|Gangsa|Kubing|Ranat Ek|Khong Wong|Khene|Pi Nai|Tro|Đàn Tranh|Đàn Bầu|Đàn Nguyệt|Đàn Tỳ Bà|Khèn|Didgeridoo|Bullroarer|Ukulele|Slack-Key Guitar|Pahu Drum|Toere'),G('European Folk Instruments','Bagpipes|Uilleann Pipes|Great Highland Bagpipe|Fiddle|Hardanger Fiddle|Nyckelharpa|Hurdy-Gurdy|Bouzouki|Mandolin|Balalaika|Domra|Cimbalom|Hammered Dulcimer|Bodhrán|Tin Whistle|Irish Flute|Bombarde|Gaida|Gusle|Tamburica|Zampogna|Organetto|Launeddas|Chitarra Battente|Mandola'),G('American Folk & Roots Instruments','Banjo|Five-String Banjo|Tenor Banjo|Mandolin|Dobro|Resonator Guitar|Pedal Steel Guitar|Lap Steel Guitar|Fiddle|Appalachian Dulcimer|Autoharp|Washboard|Jug|Washtub Bass|Cigar Box Guitar|Cajun Accordion|Frottoir|Native American Flute'),G('Voice, Body & Unusual Sound Sources','Lead Vocal|Male Vocal|Female Vocal|Choir|Gospel Choir|Children’s Choir|Operatic Soprano|Mezzo-Soprano|Alto|Tenor|Baritone|Bass Voice|Falsetto|Whispered Vocal|Spoken Word|Rap Vocal|Beatboxing|Throat Singing|Overtone Singing|Yodel|Ululation|Hand Claps|Finger Snaps|Foot Stomps|Body Percussion|Found Objects|Prepared Instruments|Field Recording|Waterphone|Glass Harmonica|Musical Saw|Hang Drum|Handpan|Tongue Drum')];const all=(groups)=>groups.flatMap(g=>g.items);const musicCount=all(music).length,instCount=all(instruments).length;const setText=(t,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(s)s.call(t,v);else t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}))};const add=(t,tag)=>{tag=String(tag||'').trim();if(!tag)return;const cur=t.value.trim();const low=cur.toLocaleLowerCase(),tl=tag.toLocaleLowerCase();let next;if(low.includes(tl)){const parts=cur.split(',').map(v=>v.trim()).filter(v=>v.toLocaleLowerCase()!==tl);next=parts.join(', ')}else next=cur?cur+( /[.!?;:]$/.test(cur)?' ':', ')+tag:tag;setText(t,next);t.focus()};const nativePresent=()=>!!document.querySelector('[data-sonara-global-suggestions-host] .sonara-global-suggestions');const mount=()=>{const t=document.getElementById('sonara-prompt');if(!(t instanceof HTMLTextAreaElement))return;const old=document.getElementById('sonara-world-suggestions-edge');if(nativePresent()){old?.remove();return}if(old)return;const root=document.createElement('div');root.id='sonara-world-suggestions-edge';root.innerHTML='<button type="button" class="swe-toggle" aria-expanded="false"><span class="swe-icon">♫</span><span class="swe-title">Universo Musica & Strumenti</span><small>'+musicCount+' stili · '+instCount+' strumenti · ricerca libera</small></button><div class="swe-panel" hidden><div class="swe-tabs"><button type="button" data-mode="music" data-active="true">Generi & Stili</button><button type="button" data-mode="instruments">Strumenti</button></div><label class="swe-search"><span>⌕</span><input type="search" placeholder="Cerca qualsiasi genere, tradizione o strumento…"></label><div class="swe-custom" hidden></div><div class="swe-count"></div><div class="swe-scroll"></div></div><style>#sonara-world-suggestions-edge{margin:10px 0 12px;padding:0 1px;font-family:inherit}.swe-toggle{width:100%;display:flex;align-items:center;gap:10px;min-height:45px;border:1px solid rgba(92,151,255,.24);border-radius:13px;background:rgba(28,74,154,.13);color:#f1f6ff;padding:9px 12px;text-align:left;cursor:pointer}.swe-icon{color:#78adff;font-size:18px}.swe-title{font-size:12px;font-weight:900}.swe-toggle small{margin-left:auto;color:#8f99aa;font-size:10px;font-weight:700}.swe-panel{margin-top:9px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:#111114;padding:12px;box-shadow:0 18px 45px rgba(0,0,0,.28)}.swe-tabs{display:flex;gap:8px;margin-bottom:10px}.swe-tabs button{border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#202024;color:#aeb4c0;padding:9px 12px;font:800 11px inherit;cursor:pointer}.swe-tabs button[data-active=true]{background:#1d6fe8;border-color:rgba(94,158,255,.55);color:#fff}.swe-search{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:#19191c;padding:0 10px}.swe-search input{width:100%;height:41px;border:0;background:transparent;color:#f5f7fb;outline:0;font:600 12px inherit}.swe-count{padding:8px 2px 4px;color:#777f8d;font:700 10px inherit}.swe-scroll{max-height:330px;overflow:auto;padding-right:3px}.swe-group{padding:8px 0 3px}.swe-group h4{margin:0 0 7px;color:#a0a8b7;font:900 10px inherit;text-transform:uppercase;letter-spacing:.08em}.swe-chips{display:flex;flex-wrap:wrap;gap:6px}.swe-chips button,.swe-custom button{min-height:31px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#202024;color:#e7eaf0;padding:6px 9px;font:700 11px inherit;cursor:pointer}.swe-chips button:hover,.swe-custom button:hover{background:#2a2a30;border-color:rgba(104,158,255,.32)}.swe-chips button[data-active=true]{background:rgba(45,112,220,.2);border-color:rgba(82,145,255,.48);color:#c5dcff}.swe-custom{padding:9px 0 2px}.swe-custom button{width:100%;text-align:left;background:rgba(40,104,210,.13);border-color:rgba(82,145,255,.3);color:#c8ddff}.swe-empty{padding:20px 4px;color:#858b96;font:600 12px inherit;text-align:center}@media(max-width:760px){.swe-toggle small{display:none}.swe-scroll{max-height:285px}.swe-chips button{font-size:10.5px}}</style>';t.insertAdjacentElement('afterend',root);let mode='music';const toggle=root.querySelector('.swe-toggle'),panel=root.querySelector('.swe-panel'),input=root.querySelector('input'),scroll=root.querySelector('.swe-scroll'),count=root.querySelector('.swe-count'),custom=root.querySelector('.swe-custom');const render=()=>{const groups=mode==='music'?music:instruments;const q=String(input.value||'').trim().toLocaleLowerCase();scroll.textContent='';let shown=0;groups.forEach(g=>{const items=q?g.items.filter(v=>v.toLocaleLowerCase().includes(q)||g.label.toLocaleLowerCase().includes(q)):g.items;if(!items.length)return;shown+=items.length;const sec=document.createElement('section');sec.className='swe-group';const h=document.createElement('h4');h.textContent=g.label;const chips=document.createElement('div');chips.className='swe-chips';items.forEach(item=>{const b=document.createElement('button');b.type='button';b.textContent=item;b.dataset.active=String(t.value.toLocaleLowerCase().includes(item.toLocaleLowerCase()));b.onclick=()=>{add(t,item);render()};chips.appendChild(b)});sec.append(h,chips);scroll.appendChild(sec)});count.textContent=q?shown+' risultati':(mode==='music'?musicCount:instCount)+' suggerimenti disponibili';custom.hidden=!q;custom.textContent='';if(q){const exists=groups.some(g=>g.items.some(v=>v.toLocaleLowerCase()===q));if(!exists){const b=document.createElement('button');b.type='button';b.textContent='+ Aggiungi comunque “'+String(input.value).trim()+'” al prompt';b.onclick=()=>{add(t,String(input.value).trim());render()};custom.appendChild(b)}else custom.hidden=true}if(!shown&&custom.hidden){const p=document.createElement('p');p.className='swe-empty';p.textContent='Nessun risultato predefinito. Scrivi il nome esatto e usa “Aggiungi comunque”.';scroll.appendChild(p)}};toggle.onclick=()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){render();setTimeout(()=>input.focus(),20)}};root.querySelectorAll('.swe-tabs button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;root.querySelectorAll('.swe-tabs button').forEach(x=>x.dataset.active=String(x===b));input.value='';render()});input.addEventListener('input',render);t.addEventListener('input',()=>{if(!panel.hidden)render()});render()};const boot=()=>{mount();new MutationObserver(mount).observe(document.body||document.documentElement,{childList:true,subtree:true});[200,500,1000,2000,4000].forEach(ms=>setTimeout(mount,ms))};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();</script>`;

function applySeoHeaders(headers) {
  headers.delete('x-robots-tag');
  headers.set('x-robots-tag', SEO_ROBOTS);
  headers.set('x-sonara-seo-title', 'sonara-ai-music-platform-v1');
}

function withBrandHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-brand', BRAND_VERSION);
  headers.set('x-sonara-header-brand', 'enterprise-logo-v5');
  headers.set('x-sonara-boot-safety', 'loop-guard-v1');
  applySeoHeaders(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function brandHtml(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withBrandHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-brand', BRAND_VERSION);
  headers.set('x-sonara-header-brand', 'enterprise-logo-v5');
  headers.set('x-sonara-boot-safety', 'loop-guard-v1');
  applySeoHeaders(headers);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(SEO_TITLE); } })
    .on('meta[name="robots"]', { element(el) { el.setAttribute('content', SEO_ROBOTS); } })
    .on('meta[property="og:site_name"]', { element(el) { el.setAttribute('content', SEO_TITLE); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', SEO_TITLE); } })
    .on('meta[name="twitter:title"]', { element(el) { el.setAttribute('content', SEO_TITLE); } })
    .on('link[rel="icon"]', { element(el) { el.remove(); } })
    .on('link[rel="shortcut icon"]', { element(el) { el.remove(); } })
    .on('link[rel="apple-touch-icon"]', { element(el) { el.remove(); } })
    .on('meta[property="og:image"]', { element(el) { el.remove(); } })
    .on('head', {
      element(el) {
        el.append(
          `<meta name="googlebot" content="${SEO_ROBOTS}">` +
          `<link rel="icon" type="image/svg+xml" sizes="any" href="${BRAND_ICON}">` +
          `<link rel="shortcut icon" type="image/svg+xml" href="${BRAND_ICON}">` +
          `<link rel="apple-touch-icon" href="${BRAND_ICON}">` +
          `<meta property="og:image" content="https://sonaraenterprise.com${BRAND_BOOT}">` +
          `<meta name="x-sonara-header-brand" content="enterprise-logo-v5">` +
          HEADER_BRAND_SCRIPT + PROMPT_TEMPO_SYNC_SCRIPT + GLOBAL_WORLD_SUGGESTIONS_SCRIPT,
          { html: true }
        );
      }
    })
    .transform(safe);
}

function brandIconResponse(request) {
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=UTF-8',
        'cache-control': 'public, max-age=86400',
        'x-sonara-brand': BRAND_VERSION
      }
    });
  }
  return new Response(BRAND_ICON_SVG, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=UTF-8',
      'cache-control': 'public, max-age=86400',
      'x-sonara-brand': BRAND_VERSION
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';

    if (publicHost && url.pathname === BRAND_ICON_PATH) return brandIconResponse(request);

    if (publicHost && (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png' || url.pathname === '/sonara-ai-icon.png')) {
      const iconUrl = new URL(BRAND_ICON, url.origin).toString();
      return Response.redirect(iconUrl, 302);
    }

    const musicRequest = await enforceCreatorMusicIntent(request);
    const response = await webRuntime.fetch(musicRequest, env, ctx);
    if (!publicHost) return response;

    if (request.method === 'GET') return brandHtml(response);
    if (request.method === 'HEAD') return withBrandHeaders(response);
    return response;
  }
};
