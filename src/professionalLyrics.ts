import type { VocalMode } from './generationPrompt';
import { getMusicStyleProfile } from './musicStyleIntelligence';

export interface ProfessionalLyricsInput {
  language: string;
  languageName?: string;
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: VocalMode;
  variant: number;
  durationSec?: number;
  bpm?: number;
  title?: string;
}

type Archetype =
  | 'club-minimal'
  | 'club-anthem'
  | 'club-fast'
  | 'ambient'
  | 'rap'
  | 'trap-drill'
  | 'pop'
  | 'rock'
  | 'punk'
  | 'metal'
  | 'rnb'
  | 'funk'
  | 'jazz'
  | 'blues'
  | 'reggae'
  | 'dancehall'
  | 'latin'
  | 'world'
  | 'folk'
  | 'country'
  | 'classical'
  | 'opera'
  | 'gospel'
  | 'cinematic'
  | 'experimental'
  | 'lounge'
  | 'children'
  | 'spoken';

type MoodGroup = 'dark' | 'romantic' | 'uplifting' | 'melancholic' | 'confident' | 'spiritual' | 'dreamy' | 'raw' | 'nostalgic' | 'celebratory' | 'peaceful' | 'mysterious';

type LocalizedTheme = {
  images: string[];
  motions: string[];
  tensions: string[];
  releases: string[];
  hooks: string[];
};

type Theme = { it: LocalizedTheme; en: LocalizedTheme };

type SectionSpec = { label: string; lines: number; role?: 'first' | 'second' | 'together'; instrumental?: boolean };

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function archetypeFor(family: string, genre: string, subgenre: string): Archetype {
  const f = normalize(family);
  const g = normalize(genre);
  const s = normalize(subgenre);
  const full = `${f} ${g} ${s}`;

  if (f === 'electronic dance') {
    if (/ambient|drone|chillout|downtempo|psybient|illbient/.test(full)) return 'ambient';
    if (/drum bass|jungle|breakbeat|garage|hard dance|hardstyle|hardcore|gabber|frenchcore|makina/.test(full)) return 'club-fast';
    if (/trance|melodic|soulful|piano house|progressive house|synthwave|retrowave|dreamwave/.test(full)) return 'club-anthem';
    return 'club-minimal';
  }
  if (f === 'hip hop rap' || /rap|hip hop/.test(g)) {
    if (/trap|drill|grime|rage|plug/.test(full)) return 'trap-drill';
    return 'rap';
  }
  if (f === 'neomelodica napoletana') return /rap|hip hop|trap/.test(s) ? 'trap-drill' : 'pop';
  if (f === 'pop') return 'pop';
  if (f === 'rock') return /punk|emo|screamo|hardcore/.test(full) ? 'punk' : 'rock';
  if (f === 'metal') return 'metal';
  if (f === 'r b soul funk') return /funk|boogie|go go/.test(full) ? 'funk' : 'rnb';
  if (f === 'jazz') return 'jazz';
  if (f === 'blues') return 'blues';
  if (f === 'reggae jamaican') return /dancehall|ragga/.test(full) ? 'dancehall' : 'reggae';
  if (f === 'latin america' || f === 'caribbean') return 'latin';
  if (['africa', 'middle east north africa', 'south asia', 'east asia', 'southeast asia'].includes(f)) return 'world';
  if (f === 'country americana') return 'country';
  if (f === 'folk traditional europe') return 'folk';
  if (f === 'classical art music') return /opera|bel canto|verismo|operetta/.test(full) ? 'opera' : 'classical';
  if (f === 'gospel spiritual') return 'gospel';
  if (f === 'cinematic media') return 'cinematic';
  if (f === 'experimental avant garde') return 'experimental';
  if (f === 'easy listening lounge') return 'lounge';
  if (f === 'children novelty spoken') return /spoken|poetry|audio drama/.test(full) ? 'spoken' : 'children';
  return 'pop';
}

function moodGroup(value: string): MoodGroup {
  const m = normalize(value);
  if (/dark|menac|ominous|nocturnal|cold|desolate|brutal|horror|tense|frost/.test(m)) return 'dark';
  if (/romantic|passion|sensual|love|tender|heartfelt|intimate/.test(m)) return 'romantic';
  if (/uplift|hope|euphor|bright|sunny|triumph|epic|heroic/.test(m)) return 'uplifting';
  if (/melanch|sad|longing|saudade|tragic|reflect|rainy/.test(m)) return 'melancholic';
  if (/confident|bold|proud|defiant|focused|powerful/.test(m)) return 'confident';
  if (/spiritual|devotional|ritual|sacred|transcendent|meditative/.test(m)) return 'spiritual';
  if (/dream|ethereal|cosmic|space|atmospheric|floating/.test(m)) return 'dreamy';
  if (/raw|gritty|aggressive|relentless|ruff|street|rebellious/.test(m)) return 'raw';
  if (/nostalg|vintage|retro|timeless|traditional/.test(m)) return 'nostalgic';
  if (/celebr|festive|joy|playful|party|communal|danceable/.test(m)) return 'celebratory';
  if (/serene|peace|calm|warm|cozy|relaxed|mellow/.test(m)) return 'peaceful';
  return 'mysterious';
}

const THEMES: Record<MoodGroup, Theme> = {
  dark: {
    it: { images: ['vetri neri dopo mezzanotte', 'un corridoio senza finestre', 'lampioni spenti nella foschia', 'ombre incise sui muri', 'un cielo basso sopra i tetti', 'scale fredde sotto i passi', 'segnali rossi nella pioggia', 'fumo fermo tra le porte'], motions: ['stringo i denti e vado avanti', 'conto i passi senza voltarmi', 'attraverso il rumore a testa alta', 'resto sveglio quando tutto tace', 'seguo una luce quasi invisibile', 'rompo il silenzio con il respiro'], tensions: ['qualcosa ci segue da lontano', 'la notte chiede un prezzo', 'ogni scelta lascia un segno', 'il silenzio pesa più del ferro', 'la paura prova a cambiare il nome alle cose'], releases: ['ma il buio non decide per me', 'e finalmente l’aria torna dentro', 'finché una scintilla apre la strada', 'poi il mattino spacca l’orizzonte'], hooks: ['Non mi spegni stanotte', 'Resto in piedi nel buio', 'Portami oltre questa ombra', 'Non torno indietro adesso', 'Fino a quando arriva luce', 'Lascia bruciare la notte'] },
    en: { images: ['black windows after midnight', 'a corridor without windows', 'streetlights fading in the mist', 'shadows carved into concrete', 'a low sky above the rooftops', 'cold stairs beneath our feet', 'red signals in the rain', 'smoke hanging between doorways'], motions: ['I grit my teeth and move forward', 'I count each step without looking back', 'I cross the noise with my head high', 'I stay awake when everything goes quiet', 'I follow a light almost out of sight', 'I break the silence with my breath'], tensions: ['something follows from a distance', 'the night keeps asking for a price', 'every choice leaves a mark', 'the silence weighs more than iron', 'fear keeps trying to rename the truth'], releases: ['but the dark does not decide for me', 'and air finally returns to my lungs', 'until one spark opens the road', 'then morning splits the horizon'], hooks: ['You will not shut me down tonight', 'I stay standing in the dark', 'Take me past this shadow', 'I am not turning back now', 'Until the light arrives', 'Let the night keep burning'] }
  },
  romantic: {
    it: { images: ['la tua giacca sulla mia sedia', 'due bicchieri rimasti a metà', 'il tuo profumo nell’ascensore', 'le tende mosse dal vento', 'un messaggio acceso alle tre', 'le tue dita sopra il mio polso', 'un taxi lento sotto casa', 'la città riflessa nei tuoi occhi'], motions: ['avvicino la mano senza parlare', 'imparo il ritmo del tuo respiro', 'rimango un secondo più del necessario', 'ti seguo fuori dalla confusione', 'lascio cadere tutte le difese', 'ti dico quello che avevo tenuto dentro'], tensions: ['abbiamo paura di chiamarlo amore', 'ci siamo quasi persi per orgoglio', 'le parole arrivano sempre in ritardo', 'domani sembra troppo lontano', 'nessuno dei due sa come finisce'], releases: ['ma stavolta non lascio la tua mano', 'e il resto del mondo può aspettare', 'finché il silenzio diventa una risposta', 'e ci scegliamo senza promettere troppo'], hooks: ['Resta qui fino al mattino', 'Dimmi che senti la stessa cosa', 'Non lasciarmi a metà', 'Stanotte scegli soltanto noi', 'Se mi guardi così, rimango', 'Tienimi vicino senza paura'] },
    en: { images: ['your jacket on my chair', 'two glasses left half full', 'your perfume in the elevator', 'curtains moving in the wind', 'your message glowing at three', 'your fingers resting on my pulse', 'a slow taxi below the window', 'the city reflected in your eyes'], motions: ['I reach for your hand without a word', 'I learn the rhythm of your breathing', 'I stay one second longer than I should', 'I follow you out of the noise', 'I let every defense fall away', 'I say what I kept inside too long'], tensions: ['we are scared to call it love', 'pride almost made us lose this', 'the right words always come too late', 'tomorrow feels too far away', 'neither of us knows how this ends'], releases: ['but this time I do not let your hand go', 'and the rest of the world can wait', 'until silence becomes an answer', 'and we choose each other without overpromising'], hooks: ['Stay here until the morning', 'Tell me you feel it too', 'Do not leave me halfway', 'Tonight choose only us', 'If you look at me like that, I stay', 'Hold me close without fear'] }
  },
  uplifting: {
    it: { images: ['il primo sole sopra i palazzi', 'scarpe nuove sull’asfalto', 'finestre aperte dopo la pioggia', 'una strada che sale verso il cielo', 'mani alzate sopra la folla', 'un treno che parte all’alba', 'colori accesi sui muri', 'aria nuova dentro i polmoni'], motions: ['corro senza chiedere permesso', 'alzo lo sguardo e cambio passo', 'porto con me quello che conta', 'apro tutte le finestre', 'lascio il peso dietro la porta', 'scelgo il prossimo chilometro'], tensions: ['per troppo tempo ho aspettato il momento giusto', 'ho dato ascolto a troppe paure', 'qualcuno diceva che era troppo tardi', 'la strada non promette niente', 'ci sono giorni che provano a piegarci'], releases: ['ma oggi il futuro ha il nostro nome', 'e ogni respiro sembra più leggero', 'finché il cielo diventa abbastanza grande', 'questa volta parto davvero'], hooks: ['Questa è la nostra ora', 'Più in alto di ieri', 'Non fermarti proprio adesso', 'Apri il cielo con me', 'Siamo vivi, siamo qui', 'Portami dove comincia il giorno'] },
    en: { images: ['first sunlight above the buildings', 'new shoes on the pavement', 'open windows after the rain', 'a road climbing into the sky', 'hands raised above the crowd', 'a train leaving at dawn', 'bright colors across the walls', 'new air inside my lungs'], motions: ['I run without asking permission', 'I lift my eyes and change my pace', 'I carry only what matters', 'I throw every window open', 'I leave the weight behind the door', 'I choose the next mile'], tensions: ['I waited too long for the perfect moment', 'I listened to too many fears', 'someone said it was already too late', 'the road never promises anything', 'some days still try to bend us'], releases: ['but today the future has our name', 'and every breath feels lighter now', 'until the sky becomes wide enough', 'this time I am really leaving'], hooks: ['This is our hour', 'Higher than yesterday', 'Do not stop right now', 'Open up the sky with me', 'We are alive, we are here', 'Take me where the day begins'] }
  },
  melancholic: {
    it: { images: ['fotografie girate contro il muro', 'pioggia sottile sul parabrezza', 'una tazza fredda sul tavolo', 'il lato vuoto del letto', 'stazioni viste dal finestrino', 'un numero che non chiamo più', 'foglie bagnate sul marciapiede', 'la tua voce dentro un vecchio audio'], motions: ['rimetto a posto cose che non servono', 'cammino piano per non svegliare i ricordi', 'cancello una frase e poi la riscrivo', 'lascio passare un altro treno', 'porto il silenzio fino a casa', 'imparo a stare dove prima c’eri tu'], tensions: ['certe assenze fanno rumore', 'non tutto quello che finisce smette di vivere', 'ci sono domande senza destinatario', 'la memoria sa essere crudele', 'alcune promesse restano aperte'], releases: ['e un giorno farà meno male', 'ma non devo dimenticare per guarire', 'finché il ricordo trova un posto più leggero', 'e lascio che il tempo faccia il suo lavoro'], hooks: ['Mi manchi ancora, ma respiro', 'Non cancellare quello che siamo stati', 'Ci siamo persi senza sparire', 'Resta almeno dentro questa canzone', 'Sto imparando a lasciarti andare', 'Il tempo non sa tutto di noi'] },
    en: { images: ['photographs turned toward the wall', 'fine rain on the windshield', 'a cold cup on the table', 'the empty side of the bed', 'stations passing beyond the glass', 'a number I no longer call', 'wet leaves on the sidewalk', 'your voice inside an old recording'], motions: ['I put away things nobody needs', 'I walk softly around the memories', 'I erase one sentence then rewrite it', 'I let another train go by', 'I carry the silence all the way home', 'I learn to stand where you once were'], tensions: ['some absences make a sound', 'not everything that ends stops living', 'there are questions with no address', 'memory knows how to be cruel', 'some promises stay unfinished'], releases: ['and one day it will hurt less', 'I do not have to forget to heal', 'until the memory finds a lighter place', 'and I let time do what it can'], hooks: ['I still miss you, but I breathe', 'Do not erase what we were', 'We got lost without disappearing', 'Stay at least inside this song', 'I am learning to let you go', 'Time does not know everything about us'] }
  },
  confident: {
    it: { images: ['il mio nome sopra la porta', 'specchi che non fanno più paura', 'un tavolo pieno di progetti', 'la città vista dall’ultimo piano', 'scarpe sporche dopo la salita', 'un telefono pieno di chiamate perse', 'la firma in fondo alla pagina', 'le luci che si accendono al mio passaggio'], motions: ['entro senza abbassare lo sguardo', 'scelgo io la direzione', 'parlo poco e faccio il resto', 'trasformo il dubbio in lavoro', 'alzo l’asticella un’altra volta', 'non chiedo spazio, lo costruisco'], tensions: ['hanno confuso il silenzio con la resa', 'mi volevano più piccolo di così', 'ogni risultato ha avuto un prezzo', 'nessuno vedeva le notti senza sonno', 'la pressione prova ancora a distrarmi'], releases: ['ora parlano i fatti al posto mio', 'e non devo più convincere nessuno', 'finché il traguardo diventa un nuovo inizio', 'questa volta decido io quando fermarmi'], hooks: ['Guarda dove sono adesso', 'Non devo chiedere permesso', 'Il mio passo parla da solo', 'Sono ancora qui, più forte', 'Niente mi cade addosso per caso', 'Faccio spazio al prossimo livello'] },
    en: { images: ['my name above the door', 'mirrors that no longer scare me', 'a table covered in plans', 'the city from the top floor', 'dirty shoes after the climb', 'a phone full of missed calls', 'my signature at the bottom of the page', 'lights turning on as I arrive'], motions: ['I walk in without lowering my eyes', 'I choose the direction myself', 'I talk less and build the rest', 'I turn doubt into work', 'I raise the bar one more time', 'I do not ask for space, I make it'], tensions: ['they confused silence with surrender', 'they wanted me smaller than this', 'every result came with a price', 'nobody saw the sleepless nights', 'pressure still tries to distract me'], releases: ['now the facts speak for me', 'and I do not need to convince anyone', 'until the finish line becomes another start', 'this time I decide when I stop'], hooks: ['Look where I am now', 'I do not need permission', 'My steps speak for themselves', 'I am still here, stronger', 'None of this fell into my hands', 'Make room for the next level'] }
  },
  spiritual: {
    it: { images: ['una candela prima dell’alba', 'mani aperte verso il cielo', 'polvere dorata nella luce', 'una stanza piena di voci', 'acqua fresca sulle dita', 'un sentiero tra gli alberi', 'il respiro di cento persone insieme', 'silenzio dentro una chiesa vuota'], motions: ['chiudo gli occhi e ascolto', 'lascio andare ciò che non controllo', 'cammino con gratitudine', 'rispondo al richiamo senza paura', 'porto il peso insieme agli altri', 'ritorno al centro del mio respiro'], tensions: ['la fede trema quando la notte è lunga', 'non tutte le domande hanno risposta', 'ho cercato forza nei posti sbagliati', 'la distanza mi ha fatto dimenticare la voce', 'certe prove chiedono pazienza'], releases: ['ma una presenza rimane accanto a me', 'e la speranza torna a cantare', 'finché il cuore ritrova la sua casa', 'insieme diventiamo più forti della paura'], hooks: ['Alza la voce con me', 'La luce torna sempre', 'Non cammino da solo', 'Portami dove il cuore crede', 'Siamo un unico respiro', 'La speranza sa ancora il mio nome'] },
    en: { images: ['a candle before the dawn', 'open hands toward the sky', 'gold dust inside the light', 'a room filled with voices', 'cool water on my fingers', 'a path between the trees', 'the breath of a hundred people together', 'silence inside an empty church'], motions: ['I close my eyes and listen', 'I release what I cannot control', 'I walk with gratitude', 'I answer the call without fear', 'I carry the weight with the others', 'I return to the center of my breath'], tensions: ['faith trembles when the night is long', 'not every question has an answer', 'I looked for strength in the wrong places', 'distance made me forget the voice', 'some trials ask for patience'], releases: ['but a presence stays beside me', 'and hope begins to sing again', 'until the heart remembers its home', 'together we become stronger than fear'], hooks: ['Raise your voice with me', 'The light always returns', 'I do not walk alone', 'Take me where the heart believes', 'We are one breath', 'Hope still knows my name'] }
  },
  dreamy: {
    it: { images: ['nuvole viola sopra i tetti', 'una luna enorme dietro i palazzi', 'strade che sembrano galleggiare', 'stelle riflesse nell’acqua', 'una stanza piena di polvere luminosa', 'treni sospesi dentro il sonno', 'un mare senza orizzonte', 'costellazioni sulla tua pelle'], motions: ['cammino senza toccare terra', 'seguo una voce dentro la nebbia', 'lascio il tempo fuori dalla porta', 'mi perdo per trovare un’altra strada', 'apro gli occhi dentro il sogno', 'salgo finché la città diventa piccola'], tensions: ['non so se sto ricordando o inventando', 'il confine continua a spostarsi', 'ogni risposta cambia forma', 'la distanza sembra infinita', 'il tempo si piega intorno a noi'], releases: ['e per un attimo tutto diventa leggero', 'finché restiamo sospesi insieme', 'poi il cielo si apre senza rumore', 'e il sogno trova un posto nel giorno'], hooks: ['Portami fuori dal tempo', 'Restiamo qui tra le nuvole', 'Non svegliarmi ancora', 'Oltre il cielo c’è spazio per noi', 'Lascia che il mondo diventi lento', 'Seguimi dove finisce la notte'] },
    en: { images: ['purple clouds above the roofs', 'a huge moon behind the buildings', 'streets that seem to float', 'stars reflected on the water', 'a room full of glowing dust', 'trains suspended inside a dream', 'a sea without a horizon', 'constellations across your skin'], motions: ['I walk without touching the ground', 'I follow a voice through the fog', 'I leave time outside the door', 'I get lost to find another road', 'I open my eyes inside the dream', 'I rise until the city looks small'], tensions: ['I cannot tell if I remember or invent this', 'the border keeps moving away', 'every answer changes shape', 'the distance feels endless', 'time bends around us'], releases: ['and for a moment everything turns weightless', 'until we stay suspended together', 'then the sky opens without a sound', 'and the dream finds a place in daylight'], hooks: ['Take me outside of time', 'Let us stay here in the clouds', 'Do not wake me yet', 'Beyond the sky there is room for us', 'Let the whole world slow down', 'Follow me where the night ends'] }
  },
  raw: {
    it: { images: ['cemento bagnato sotto le suole', 'saracinesche piene di graffi', 'mani sporche dopo il lavoro', 'un neon rotto sopra il bar', 'scale di servizio senza luce', 'muri pieni di nomi', 'fumo che esce dai tombini', 'un parcheggio vuoto alle quattro'], motions: ['dico le cose senza lucidarle', 'tengo il ritmo con i nervi', 'spingo il peso un metro più avanti', 'rimango vero anche quando costa', 'taglio corto e vado al punto', 'non nascondo le cicatrici'], tensions: ['qui nessuno regala niente', 'la strada ricorda ogni errore', 'la rabbia ha memoria lunga', 'le promesse facili durano poco', 'ogni giorno chiede carattere'], releases: ['ma ho imparato a reggere l’urto', 'e trasformo la pressione in direzione', 'finché rimane soltanto ciò che è vero', 'non serve sembrare forti quando lo sei'], hooks: ['Niente filtri, resta vero', 'Spingi ancora, non mollare', 'Questo peso non mi piega', 'Parla chiaro, vai diritto', 'Sporco fuori, lucido dentro', 'Non abbasso mai il volume'] },
    en: { images: ['wet concrete under my soles', 'shutters covered in scratches', 'dirty hands after the work', 'a broken neon above the bar', 'service stairs without light', 'walls covered in names', 'steam rising from the street', 'an empty parking lot at four'], motions: ['I say it without polishing the edges', 'I keep the rhythm in my nerves', 'I push the weight one meter farther', 'I stay real even when it costs me', 'I cut it short and get to the point', 'I never hide the scars'], tensions: ['nobody gives you anything here', 'the street remembers every mistake', 'anger has a long memory', 'easy promises do not last', 'every day asks for character'], releases: ['but I learned how to take the hit', 'and I turn pressure into direction', 'until only what is real remains', 'you do not need to look strong when you are'], hooks: ['No filter, keep it real', 'Push again, do not let go', 'This weight will not bend me', 'Say it straight, move forward', 'Dirty outside, clear inside', 'I never turn the volume down'] }
  },
  nostalgic: {
    it: { images: ['cassette dentro un vecchio cassetto', 'foto sbiadite dell’estate', 'un motorino davanti alla scuola', 'luci arancioni sul lungomare', 'una radio accesa in cucina', 'biglietti piegati nel portafoglio', 'la casa dei nonni a settembre', 'un’insegna che non esiste più'], motions: ['riavvolgo il tempo senza volerlo', 'riconosco una voce dopo anni', 'torno con la mente a quella strada', 'sorrido prima ancora di capire perché', 'rimetto una vecchia canzone', 'conto gli anni come fermate'], tensions: ['non si torna davvero nello stesso posto', 'alcune persone restano soltanto nei dettagli', 'il tempo cambia anche le fotografie', 'abbiamo perso cose senza accorgercene', 'la memoria sceglie cosa salvare'], releases: ['ma certe emozioni sanno aspettare', 'e per un attimo siamo di nuovo lì', 'finché il passato smette di fare male', 'porto con me quello che vale ancora'], hooks: ['Fammi tornare a quella sera', 'Ricordi quando bastava poco?', 'Quella luce vive ancora', 'Non buttare via quei giorni', 'Siamo ancora dentro quella foto', 'Rimetti dall’inizio la canzone'] },
    en: { images: ['cassettes inside an old drawer', 'faded pictures from the summer', 'a small bike outside the school', 'orange lights along the coast', 'a radio playing in the kitchen', 'folded tickets inside a wallet', 'my grandparents house in September', 'a sign that is not there anymore'], motions: ['I rewind time without meaning to', 'I recognize a voice after years', 'my mind walks back to that street', 'I smile before I know the reason', 'I play an old song again', 'I count the years like stations'], tensions: ['you never return to exactly the same place', 'some people survive only in the details', 'time changes even the photographs', 'we lost things without noticing', 'memory decides what it wants to save'], releases: ['but some feelings know how to wait', 'and for one moment we are there again', 'until the past stops hurting', 'I carry what still matters with me'], hooks: ['Take me back to that evening', 'Remember when little things were enough?', 'That light is still alive', 'Do not throw those days away', 'We are still inside that photograph', 'Play the song from the beginning'] }
  },
  celebratory: {
    it: { images: ['bicchieri alzati sopra le teste', 'scarpe che non stanno più ferme', 'balconi pieni di gente', 'luci calde sopra la pista', 'mani che battono lo stesso tempo', 'una strada trasformata in festa', 'sorrisi riflessi nei vetri', 'il sole che arriva senza invito'], motions: ['entro nel ritmo con tutto il corpo', 'chiamo gli altri più vicino', 'lascio il telefono in tasca', 'rido fino a perdere il fiato', 'seguo il battito della stanza', 'ballo come se domani fosse libero'], tensions: ['abbiamo lavorato troppo per non festeggiare', 'la settimana ha provato a stancarci', 'fuori il mondo corre ancora', 'domani torneranno le responsabilità', 'qualcuno dice che è già tardi'], releases: ['ma questa notte appartiene a noi', 'e nessuno vuole tornare a casa', 'finché l’alba entra dalla porta', 'oggi non serve pensare più lontano'], hooks: ['Alza tutto, siamo qui', 'Questa notte non si conta', 'Vieni più vicino e balla', 'Fino all’alba senza paura', 'Lascia fuori tutti i pensieri', 'Uno, due, ancora più forte'] },
    en: { images: ['glasses raised above our heads', 'shoes that will not stay still', 'balconies filled with people', 'warm lights over the floor', 'hands clapping the same time', 'a street turning into a party', 'smiles reflected in the windows', 'the sun arriving uninvited'], motions: ['I step into the rhythm with my whole body', 'I call everybody closer', 'I leave my phone inside my pocket', 'I laugh until I lose my breath', 'I follow the heartbeat of the room', 'I dance like tomorrow is free'], tensions: ['we worked too hard not to celebrate', 'the week tried to wear us down', 'the world outside keeps running', 'tomorrow the responsibilities return', 'someone says it is already late'], releases: ['but this night belongs to us', 'and nobody wants to go home', 'until dawn walks through the door', 'today we do not need to think farther'], hooks: ['Turn it up, we are here', 'Do not count this night', 'Come closer and dance', 'Until dawn without fear', 'Leave every thought outside', 'One, two, louder again'] }
  },
  peaceful: {
    it: { images: ['tende bianche mosse piano', 'una tazza calda tra le mani', 'il mare quasi fermo al mattino', 'luce morbida sul pavimento', 'un giardino dopo la pioggia', 'lenzuola fresche alla finestra', 'il rumore lontano della città', 'un libro aperto sul divano'], motions: ['rallento il passo senza colpa', 'respiro fino in fondo', 'lascio il giorno arrivare da solo', 'metto ordine nei pensieri', 'ascolto ciò che prima coprivo col rumore', 'rimango qui senza dover dimostrare niente'], tensions: ['ho corso più del necessario', 'il mondo chiede sempre una risposta immediata', 'certe giornate riempiono troppo la testa', 'non tutto va risolto stanotte', 'anche il silenzio può fare paura'], releases: ['ma adesso posso stare fermo', 'e finalmente sento quello che conta', 'finché il respiro torna regolare', 'questa calma non ha bisogno di spiegazioni'], hooks: ['Resta piano qui con me', 'Non abbiamo fretta', 'Lascia andare il resto', 'Respira, il mondo può aspettare', 'Qui basta poco', 'Tutto torna al suo posto'] },
    en: { images: ['white curtains moving slowly', 'a warm cup between my hands', 'the sea almost still in the morning', 'soft light across the floor', 'a garden after the rain', 'fresh sheets by the window', 'the distant noise of the city', 'an open book on the sofa'], motions: ['I slow down without feeling guilty', 'I breathe all the way in', 'I let the day arrive by itself', 'I put my thoughts back in order', 'I listen to what noise used to cover', 'I stay here without proving anything'], tensions: ['I ran farther than I needed to', 'the world always wants an immediate answer', 'some days put too much inside my head', 'not everything needs solving tonight', 'even silence can feel unfamiliar'], releases: ['but now I can stand still', 'and I finally hear what matters', 'until my breathing becomes steady again', 'this calm does not need an explanation'], hooks: ['Stay quietly here with me', 'We do not have to hurry', 'Let the rest go', 'Breathe, the world can wait', 'A little is enough here', 'Everything finds its place'] }
  },
  mysterious: {
    it: { images: ['una porta socchiusa al quinto piano', 'una telefonata senza voce', 'mappe segnate a matita', 'un riflesso che arriva in ritardo', 'numeri scritti sopra il vetro', 'una chiave trovata per strada', 'un nome cancellato dal citofono', 'impronte che finiscono davanti al mare'], motions: ['seguo gli indizi senza fare rumore', 'metto insieme pezzi che non combaciano', 'ascolto ciò che manca tra le parole', 'apro una stanza che non ricordavo', 'cammino dove la luce cambia colore', 'tengo una domanda dentro la tasca'], tensions: ['qualcuno conosce già la risposta', 'ogni certezza nasconde un’altra porta', 'non tutto ciò che vedo è successo davvero', 'la verità cambia forma da vicino', 'manca sempre un ultimo dettaglio'], releases: ['e forse non serve sapere tutto', 'finché la domanda resta viva', 'poi un dettaglio cambia tutta la storia', 'lascio che il mistero resti aperto'], hooks: ['Dimmi cosa non stai dicendo', 'C’è qualcosa dietro quella porta', 'Seguimi senza fare rumore', 'Non chiamarlo ancora destino', 'Manca un pezzo della storia', 'Lascia aperta la domanda'] },
    en: { images: ['a half open door on the fifth floor', 'a phone call with no voice', 'maps marked in pencil', 'a reflection arriving too late', 'numbers written across the glass', 'a key found in the street', 'a name erased from the intercom', 'footprints ending by the sea'], motions: ['I follow the clues without a sound', 'I fit together pieces that refuse to match', 'I listen to what is missing between words', 'I open a room I do not remember', 'I walk where the light changes color', 'I carry one question in my pocket'], tensions: ['someone already knows the answer', 'every certainty hides another door', 'not everything I see really happened', 'truth changes shape when you get close', 'one final detail is always missing'], releases: ['and maybe I do not need to know everything', 'as long as the question stays alive', 'then one detail changes the whole story', 'I let the mystery remain open'], hooks: ['Tell me what you are not saying', 'There is something behind that door', 'Follow me without a sound', 'Do not call it destiny yet', 'One piece of the story is missing', 'Leave the question open'] }
  }
};

function hash(value: string): number {
  let h = 2166136261;
  for (const ch of value) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomFactory(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(values: readonly T[], rand: () => number): T {
  return values[Math.floor(rand() * values.length) % values.length];
}

function blueprint(archetype: Archetype, durationSec: number): SectionSpec[] {
  const long = durationSec >= 240;
  const veryLong = durationSec >= 360;
  const specs: Record<Archetype, SectionSpec[]> = {
    'club-minimal': [
      { label: 'Intro Vocal', lines: 2, role: 'first' }, { label: 'Hook', lines: 4, role: 'together' },
      { label: 'Instrumental Groove - 8 bars', lines: 0, instrumental: true }, { label: 'Verse 1', lines: 6, role: 'first' },
      { label: 'Hook', lines: 4, role: 'together' }, { label: 'Breakdown', lines: 4, role: 'second' },
      ...(long ? [{ label: 'Instrumental Break - 16 bars', lines: 0, instrumental: true } as SectionSpec, { label: 'Verse 2', lines: 6, role: 'second' } as SectionSpec] : []),
      { label: 'Final Hook', lines: 6, role: 'together' }, { label: 'Outro Vocal', lines: 2, role: 'together' }
    ],
    'club-anthem': [
      { label: 'Verse 1', lines: 6, role: 'first' }, { label: 'Pre-Chorus', lines: 4, role: 'first' }, { label: 'Chorus', lines: 6, role: 'together' },
      { label: 'Instrumental Drop - 8 bars', lines: 0, instrumental: true }, { label: 'Verse 2', lines: 6, role: 'second' },
      { label: 'Pre-Chorus 2', lines: 4, role: 'second' }, { label: 'Chorus', lines: 6, role: 'together' },
      ...(long ? [{ label: 'Breakdown', lines: 4, role: 'first' } as SectionSpec, { label: 'Instrumental Build - 8 bars', lines: 0, instrumental: true } as SectionSpec] : []),
      { label: 'Bridge', lines: 4, role: 'together' }, { label: 'Final Chorus', lines: 8, role: 'together' }, { label: 'Outro', lines: 2, role: 'together' }
    ],
    'club-fast': [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Hook', lines: 6, role: 'together' }, { label: 'Drop - Instrumental 16 bars', lines: 0, instrumental: true },
      { label: 'Verse 2', lines: 8, role: 'second' }, { label: 'Hook', lines: 6, role: 'together' }, { label: 'Breakdown', lines: 4, role: 'first' },
      ...(long ? [{ label: 'Verse 3', lines: 8, role: 'second' } as SectionSpec] : []), { label: 'Final Hook', lines: 8, role: 'together' }
    ],
    ambient: [
      { label: 'Verse 1', lines: 5, role: 'first' }, { label: 'Refrain', lines: 4, role: 'together' }, { label: 'Instrumental Passage - 16 bars', lines: 0, instrumental: true },
      { label: 'Verse 2', lines: 5, role: 'second' }, ...(long ? [{ label: 'Verse 3', lines: 5, role: 'first' } as SectionSpec] : []),
      { label: 'Refrain', lines: 4, role: 'together' }, { label: 'Outro', lines: 4, role: 'together' }
    ],
    rap: [
      { label: 'Verse 1 - 16 bars', lines: 12, role: 'first' }, { label: 'Hook - 8 bars', lines: 6, role: 'together' },
      { label: 'Verse 2 - 16 bars', lines: 12, role: 'second' }, { label: 'Hook - 8 bars', lines: 6, role: 'together' },
      ...(long ? [{ label: 'Verse 3 - 16 bars', lines: 12, role: 'first' } as SectionSpec] : []),
      { label: 'Bridge', lines: 6, role: 'together' }, { label: 'Final Hook', lines: 8, role: 'together' }
    ],
    'trap-drill': [
      { label: 'Intro', lines: 4, role: 'first' }, { label: 'Hook', lines: 6, role: 'together' }, { label: 'Verse 1 - 16 bars', lines: 12, role: 'first' },
      { label: 'Hook', lines: 6, role: 'together' }, { label: 'Verse 2 - 16 bars', lines: 12, role: 'second' },
      ...(long ? [{ label: 'Bridge / Switch', lines: 8, role: 'together' } as SectionSpec] : []), { label: 'Final Hook', lines: 8, role: 'together' }
    ],
    pop: [
      { label: 'Verse 1', lines: 6, role: 'first' }, { label: 'Pre-Chorus', lines: 4, role: 'first' }, { label: 'Chorus', lines: 6, role: 'together' },
      { label: 'Verse 2', lines: 6, role: 'second' }, { label: 'Pre-Chorus 2', lines: 4, role: 'second' }, { label: 'Chorus', lines: 6, role: 'together' },
      ...(long ? [{ label: 'Verse 3', lines: 6, role: 'first' } as SectionSpec] : []), { label: 'Bridge', lines: 5, role: 'together' }, { label: 'Final Chorus', lines: 8, role: 'together' },
      ...(veryLong ? [{ label: 'Outro', lines: 3, role: 'together' } as SectionSpec] : [])
    ],
    rock: [
      { label: 'Verse 1', lines: 7, role: 'first' }, { label: 'Pre-Chorus', lines: 4, role: 'first' }, { label: 'Chorus', lines: 7, role: 'together' },
      { label: 'Verse 2', lines: 7, role: 'second' }, { label: 'Chorus', lines: 7, role: 'together' }, { label: 'Instrumental / Guitar Break - 8 bars', lines: 0, instrumental: true },
      ...(long ? [{ label: 'Verse 3', lines: 7, role: 'first' } as SectionSpec] : []), { label: 'Bridge', lines: 5, role: 'together' }, { label: 'Final Chorus', lines: 9, role: 'together' }
    ],
    punk: [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Chorus', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 8, role: 'second' },
      { label: 'Chorus', lines: 6, role: 'together' }, ...(long ? [{ label: 'Breakdown', lines: 6, role: 'first' } as SectionSpec] : []), { label: 'Final Chorus', lines: 8, role: 'together' }
    ],
    metal: [
      { label: 'Verse 1', lines: 7, role: 'first' }, { label: 'Pre-Chorus', lines: 4, role: 'first' }, { label: 'Chorus', lines: 7, role: 'together' },
      { label: 'Verse 2', lines: 7, role: 'second' }, { label: 'Breakdown', lines: 6, role: 'together' },
      ...(long ? [{ label: 'Instrumental / Solo - 8 bars', lines: 0, instrumental: true } as SectionSpec, { label: 'Verse 3', lines: 7, role: 'first' } as SectionSpec] : []),
      { label: 'Bridge', lines: 5, role: 'together' }, { label: 'Final Chorus', lines: 9, role: 'together' }
    ],
    rnb: [
      { label: 'Verse 1', lines: 7, role: 'first' }, { label: 'Pre-Chorus', lines: 4, role: 'first' }, { label: 'Hook', lines: 6, role: 'together' },
      { label: 'Verse 2', lines: 7, role: 'second' }, { label: 'Hook', lines: 6, role: 'together' }, ...(long ? [{ label: 'Verse 3', lines: 6, role: 'first' } as SectionSpec] : []),
      { label: 'Bridge', lines: 6, role: 'together' }, { label: 'Final Hook / Ad-libs', lines: 8, role: 'together' }, { label: 'Outro', lines: 3, role: 'together' }
    ],
    funk: [
      { label: 'Verse 1', lines: 6, role: 'first' }, { label: 'Hook', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 6, role: 'second' },
      { label: 'Call & Response', lines: 8, role: 'together' }, { label: 'Instrumental Groove - 8 bars', lines: 0, instrumental: true },
      ...(long ? [{ label: 'Verse 3', lines: 6, role: 'first' } as SectionSpec] : []), { label: 'Final Hook', lines: 8, role: 'together' }
    ],
    jazz: [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Refrain', lines: 5, role: 'together' }, { label: 'Verse 2', lines: 8, role: 'second' },
      { label: 'Instrumental Solo - 16 bars', lines: 0, instrumental: true }, ...(long ? [{ label: 'Verse 3', lines: 8, role: 'first' } as SectionSpec] : []),
      { label: 'Refrain', lines: 5, role: 'together' }, { label: 'Coda', lines: 4, role: 'together' }
    ],
    blues: [
      { label: 'Verse 1 - AAB', lines: 6, role: 'first' }, { label: 'Refrain', lines: 4, role: 'together' }, { label: 'Verse 2 - AAB', lines: 6, role: 'second' },
      { label: 'Instrumental Turnaround - 12 bars', lines: 0, instrumental: true }, { label: 'Verse 3 - AAB', lines: 6, role: 'first' },
      ...(long ? [{ label: 'Verse 4 - AAB', lines: 6, role: 'second' } as SectionSpec] : []), { label: 'Final Refrain', lines: 6, role: 'together' }
    ],
    reggae: [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Chorus', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 8, role: 'second' },
      { label: 'Chorus', lines: 6, role: 'together' }, ...(long ? [{ label: 'Dub Break - 8 bars', lines: 0, instrumental: true } as SectionSpec, { label: 'Verse 3', lines: 8, role: 'first' } as SectionSpec] : []),
      { label: 'Bridge', lines: 6, role: 'together' }, { label: 'Final Chorus', lines: 8, role: 'together' }
    ],
    dancehall: [
      { label: 'Intro / Call', lines: 4, role: 'first' }, { label: 'Hook', lines: 6, role: 'together' }, { label: 'Verse 1', lines: 10, role: 'first' },
      { label: 'Hook', lines: 6, role: 'together' }, { label: 'Verse 2 / Toast', lines: 10, role: 'second' },
      ...(long ? [{ label: 'Break / Call & Response', lines: 8, role: 'together' } as SectionSpec] : []), { label: 'Final Hook', lines: 8, role: 'together' }
    ],
    latin: [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Pre-Coro', lines: 4, role: 'first' }, { label: 'Coro', lines: 6, role: 'together' },
      { label: 'Verse 2', lines: 8, role: 'second' }, { label: 'Coro', lines: 6, role: 'together' },
      ...(long ? [{ label: 'Pregón / Call & Response', lines: 8, role: 'together' } as SectionSpec, { label: 'Instrumental Break - 8 bars', lines: 0, instrumental: true } as SectionSpec] : []),
      { label: 'Bridge', lines: 5, role: 'together' }, { label: 'Coro Final', lines: 9, role: 'together' }
    ],
    world: [
      { label: 'Verse 1', lines: 7, role: 'first' }, { label: 'Refrain / Response', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 7, role: 'second' },
      { label: 'Refrain / Response', lines: 6, role: 'together' }, ...(long ? [{ label: 'Call & Response', lines: 8, role: 'together' } as SectionSpec] : []),
      { label: 'Bridge', lines: 5, role: 'first' }, { label: 'Final Refrain', lines: 8, role: 'together' }
    ],
    folk: [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Refrain', lines: 5, role: 'together' }, { label: 'Verse 2', lines: 8, role: 'second' },
      ...(long ? [{ label: 'Verse 3', lines: 8, role: 'first' } as SectionSpec] : []), { label: 'Bridge', lines: 5, role: 'together' }, { label: 'Final Refrain', lines: 7, role: 'together' }
    ],
    country: [
      { label: 'Verse 1', lines: 8, role: 'first' }, { label: 'Chorus', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 8, role: 'second' },
      { label: 'Chorus', lines: 6, role: 'together' }, ...(long ? [{ label: 'Verse 3', lines: 8, role: 'first' } as SectionSpec] : []), { label: 'Bridge', lines: 5, role: 'together' }, { label: 'Final Chorus', lines: 8, role: 'together' }
    ],
    classical: [
      { label: 'Opening Verse', lines: 6, role: 'first' }, { label: 'Refrain', lines: 5, role: 'together' }, { label: 'Instrumental Interlude', lines: 0, instrumental: true },
      { label: 'Second Verse', lines: 6, role: 'second' }, ...(long ? [{ label: 'Development', lines: 6, role: 'first' } as SectionSpec] : []),
      { label: 'Ensemble', lines: 6, role: 'together' }, { label: 'Finale', lines: 8, role: 'together' }
    ],
    opera: [
      { label: 'Recitative', lines: 7, role: 'first' }, { label: 'Aria', lines: 8, role: 'first' }, { label: 'Interlude', lines: 0, instrumental: true },
      { label: 'Second Aria', lines: 8, role: 'second' }, ...(long ? [{ label: 'Dramatic Confrontation', lines: 8, role: 'together' } as SectionSpec] : []),
      { label: 'Ensemble', lines: 7, role: 'together' }, { label: 'Finale', lines: 9, role: 'together' }
    ],
    gospel: [
      { label: 'Verse 1', lines: 7, role: 'first' }, { label: 'Chorus', lines: 8, role: 'together' }, { label: 'Verse 2', lines: 7, role: 'second' },
      { label: 'Chorus', lines: 8, role: 'together' }, ...(long ? [{ label: 'Testimony', lines: 7, role: 'first' } as SectionSpec] : []),
      { label: 'Bridge / Build', lines: 8, role: 'together' }, { label: 'Final Chorus / Choir Lift', lines: 10, role: 'together' }, { label: 'Outro', lines: 4, role: 'together' }
    ],
    cinematic: [
      { label: 'Verse 1', lines: 6, role: 'first' }, { label: 'Refrain', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 6, role: 'second' },
      { label: 'Build', lines: 5, role: 'first' }, ...(long ? [{ label: 'Instrumental Development', lines: 0, instrumental: true } as SectionSpec, { label: 'Bridge', lines: 6, role: 'together' } as SectionSpec] : []),
      { label: 'Climax', lines: 9, role: 'together' }, { label: 'Resolution', lines: 4, role: 'together' }
    ],
    experimental: [
      { label: 'Fragment I', lines: 7, role: 'first' }, { label: 'Refrain / Motif', lines: 4, role: 'together' }, { label: 'Fragment II', lines: 7, role: 'second' },
      { label: 'Dislocation', lines: 6, role: 'together' }, ...(long ? [{ label: 'Silence / Instrumental Field', lines: 0, instrumental: true } as SectionSpec, { label: 'Fragment III', lines: 7, role: 'first' } as SectionSpec] : []),
      { label: 'Final Motif', lines: 6, role: 'together' }
    ],
    lounge: [
      { label: 'Verse 1', lines: 6, role: 'first' }, { label: 'Refrain', lines: 5, role: 'together' }, { label: 'Verse 2', lines: 6, role: 'second' },
      { label: 'Instrumental Interlude', lines: 0, instrumental: true }, ...(long ? [{ label: 'Verse 3', lines: 6, role: 'first' } as SectionSpec] : []),
      { label: 'Bridge', lines: 4, role: 'together' }, { label: 'Final Refrain', lines: 7, role: 'together' }
    ],
    children: [
      { label: 'Verse 1', lines: 6, role: 'first' }, { label: 'Chorus', lines: 6, role: 'together' }, { label: 'Verse 2', lines: 6, role: 'second' },
      { label: 'Chorus', lines: 6, role: 'together' }, ...(long ? [{ label: 'Verse 3', lines: 6, role: 'first' } as SectionSpec] : []), { label: 'Bridge', lines: 4, role: 'together' }, { label: 'Final Chorus', lines: 7, role: 'together' }
    ],
    spoken: [
      { label: 'Part I', lines: 9, role: 'first' }, { label: 'Refrain', lines: 4, role: 'together' }, { label: 'Part II', lines: 9, role: 'second' },
      ...(long ? [{ label: 'Part III', lines: 9, role: 'first' } as SectionSpec] : []), { label: 'Closing', lines: 7, role: 'together' }
    ]
  };

  const chosen = specs[archetype];
  if (durationSec <= 60) return chosen.slice(0, Math.min(4, chosen.length));
  if (durationSec <= 120) return chosen.slice(0, Math.min(6, chosen.length));
  return chosen;
}

function sectionTag(spec: SectionSpec, vocalMode: VocalMode): string {
  if (spec.instrumental || vocalMode !== 'duet' || !spec.role) return `[${spec.label}]`;
  const role = spec.role === 'first' ? 'Male' : spec.role === 'second' ? 'Female' : 'Male + Female';
  return `[${spec.label} - ${role}]`;
}

function lineFor(archetype: Archetype, theme: LocalizedTheme, italian: boolean, rand: () => number, index: number): string {
  const image = pick(theme.images, rand);
  const motion = pick(theme.motions, rand);
  const tension = pick(theme.tensions, rand);
  const release = pick(theme.releases, rand);
  const patterns: Record<Archetype, Array<(a: string, b: string, c: string, d: string) => string>> = {
    'club-minimal': italian
      ? [(a,b)=>`${a}, ${b}`, (_a,b)=>b, (_a,_b,c)=>c, (a)=>`Dentro ${a}`, (_a,_b,_c,d)=>d]
      : [(a,b)=>`${a}, ${b}`, (_a,b)=>b, (_a,_b,c)=>c, (a)=>`Inside ${a}`, (_a,_b,_c,d)=>d],
    'club-anthem': italian
      ? [(a,b)=>`Da ${a}, ${b}`, (_a,_b,c,d)=>`${c}, ma ${d}`, (a)=>`Vedo ${a}`, (_a,b)=>`E allora ${b}`]
      : [(a,b)=>`From ${a}, ${b}`, (_a,_b,c,d)=>`${c}, but ${d}`, (a)=>`I see ${a}`, (_a,b)=>`And then ${b}`],
    'club-fast': italian
      ? [(a,b)=>`${b} sopra ${a}`, (_a,_b,c)=>c, (_a,b,_c,d)=>`${b}, ${d}`, (a)=>`Corro dentro ${a}`]
      : [(a,b)=>`${b} over ${a}`, (_a,_b,c)=>c, (_a,b,_c,d)=>`${b}, ${d}`, (a)=>`I run through ${a}`],
    ambient: italian
      ? [(a)=>`Rimane ${a}`, (a,b)=>`${b} mentre guardo ${a}`, (_a,_b,c,d)=>`${c}; ${d}`, (a)=>`Respira piano ${a}`]
      : [(a)=>`${a} remains`, (a,b)=>`${b} while I watch ${a}`, (_a,_b,c,d)=>`${c}; ${d}`, (a)=>`${a} breathes slowly`],
    rap: italian
      ? [(a,b)=>`${b}, con ${a} davanti`, (_a,_b,c,d)=>`${c}, però ${d}`, (a)=>`Ho visto ${a} cambiare faccia`, (_a,b)=>`${b}, non devo dirlo due volte`, (_a,_b,c)=>`Mi ricordo bene: ${c}`]
      : [(a,b)=>`${b}, with ${a} in front of me`, (_a,_b,c,d)=>`${c}, still ${d}`, (a)=>`I watched ${a} change its face`, (_a,b)=>`${b}, I do not say it twice`, (_a,_b,c)=>`I remember this: ${c}`],
    'trap-drill': italian
      ? [(_a,b)=>b, (a)=>`${a}, occhi aperti`, (_a,_b,c)=>c, (_a,b,_c,d)=>`${b}; ${d}`, (a,_b,c)=>`${a}, ${c}`]
      : [(_a,b)=>b, (a)=>`${a}, eyes open`, (_a,_b,c)=>c, (_a,b,_c,d)=>`${b}; ${d}`, (a,_b,c)=>`${a}, ${c}`],
    pop: italian
      ? [(a,b)=>`Ti penso mentre ${b}, davanti a ${a}`, (_a,_b,c,d)=>`${c}, ma ${d}`, (a)=>`C’è ancora ${a} nei miei occhi`, (_a,b)=>`Questa volta ${b}`]
      : [(a,b)=>`I think of you while ${b}, facing ${a}`, (_a,_b,c,d)=>`${c}, but ${d}`, (a)=>`I still see ${a}`, (_a,b)=>`This time ${b}`],
    rock: italian
      ? [(a,b)=>`${b} con ${a} alle spalle`, (_a,_b,c)=>`Non importa se ${c}`, (_a,b,_c,d)=>`${b}, perché ${d}`, (a)=>`Alzo la voce sopra ${a}`]
      : [(a,b)=>`${b} with ${a} behind me`, (_a,_b,c)=>`It does not matter if ${c}`, (_a,b,_c,d)=>`${b}, because ${d}`, (a)=>`I raise my voice above ${a}`],
    punk: italian
      ? [(_a,b)=>b, (_a,_b,c)=>`Non accetto che ${c}`, (a)=>`Scrivo tutto sopra ${a}`, (_a,b,_c,d)=>`${b}: ${d}`]
      : [(_a,b)=>b, (_a,_b,c)=>`I will not accept that ${c}`, (a)=>`I write it all across ${a}`, (_a,b,_c,d)=>`${b}: ${d}`],
    metal: italian
      ? [(a,_b,c)=>`${a}: ${c}`, (_a,b)=>`${b} anche se trema tutto`, (_a,_b,c,d)=>`${c}, eppure ${d}`, (a,b)=>`Attraverso ${a}, ${b}`]
      : [(a,_b,c)=>`${a}: ${c}`, (_a,b)=>`${b} even when everything shakes`, (_a,_b,c,d)=>`${c}, yet ${d}`, (a,b)=>`I cross ${a}, ${b}`],
    rnb: italian
      ? [(a,b)=>`${b} quando penso a ${a}`, (_a,_b,c,d)=>`${c}, ma con te ${d}`, (a)=>`Sento ancora ${a} sulla pelle`, (_a,b)=>`Piano, ${b}`]
      : [(a,b)=>`${b} when I think about ${a}`, (_a,_b,c,d)=>`${c}, but with you ${d}`, (a)=>`I still feel ${a} on my skin`, (_a,b)=>`Slowly, ${b}`],
    funk: italian
      ? [(a,b)=>`${b}, fai spazio a ${a}`, (_a,b)=>`Uno, due: ${b}`, (_a,_b,c,d)=>`${c}? ${d}`, (a)=>`Muovi tutto intorno a ${a}`]
      : [(a,b)=>`${b}, make room for ${a}`, (_a,b)=>`One, two: ${b}`, (_a,_b,c,d)=>`${c}? ${d}`, (a)=>`Move everything around ${a}`],
    jazz: italian
      ? [(a,b)=>`${a}; ${b}`, (_a,_b,c,d)=>`${c}, poi ${d}`, (a)=>`La notte cambia accordo sopra ${a}`, (_a,b)=>`${b} senza chiudere la frase`]
      : [(a,b)=>`${a}; ${b}`, (_a,_b,c,d)=>`${c}, then ${d}`, (a)=>`The night changes chords above ${a}`, (_a,b)=>`${b} without closing the phrase`],
    blues: italian
      ? [(a)=>`Stamattina ho trovato ${a}`, (a)=>`Sì, stamattina ho trovato ${a}`, (_a,_b,c,d)=>`${c}, ma ${d}`, (_a,b)=>`E continuo: ${b}`]
      : [(a)=>`This morning I found ${a}`, (a)=>`Yes, this morning I found ${a}`, (_a,_b,c,d)=>`${c}, but ${d}`, (_a,b)=>`And I keep going: ${b}`],
    reggae: italian
      ? [(a,b)=>`${b} sotto ${a}`, (_a,_b,c,d)=>`${c}, però ${d}`, (a)=>`Ascolta cosa dice ${a}`, (_a,b)=>`Passo dopo passo ${b}`]
      : [(a,b)=>`${b} beneath ${a}`, (_a,_b,c,d)=>`${c}, still ${d}`, (a)=>`Listen to what ${a} is saying`, (_a,b)=>`Step by step ${b}`],
    dancehall: italian
      ? [(_a,b)=>b, (a)=>`Tutta la stanza vede ${a}`, (_a,_b,c)=>c, (_a,b,_c,d)=>`${b}, ${d}`]
      : [(_a,b)=>b, (a)=>`The whole room sees ${a}`, (_a,_b,c)=>c, (_a,b,_c,d)=>`${b}, ${d}`],
    latin: italian
      ? [(a,b)=>`${b} mentre passa ${a}`, (_a,_b,c,d)=>`${c}, ma ${d}`, (a)=>`La notte gira intorno a ${a}`, (_a,b)=>`Vieni vicino: ${b}`]
      : [(a,b)=>`${b} while ${a} passes by`, (_a,_b,c,d)=>`${c}, but ${d}`, (a)=>`The night turns around ${a}`, (_a,b)=>`Come closer: ${b}`],
    world: italian
      ? [(a,b)=>`${a} ricorda mentre ${b}`, (_a,_b,c,d)=>`${c}; ${d}`, (a)=>`Da lontano ritorna ${a}`, (_a,b)=>`La voce risponde: ${b}`]
      : [(a,b)=>`${a} remembers while ${b}`, (_a,_b,c,d)=>`${c}; ${d}`, (a)=>`${a} returns from far away`, (_a,b)=>`The voice answers: ${b}`],
    folk: italian
      ? [(a,b)=>`Ho imparato ${b} vicino a ${a}`, (_a,_b,c,d)=>`${c}, e col tempo ${d}`, (a)=>`C’è una storia dentro ${a}`, (_a,b)=>`La porto con me: ${b}`]
      : [(a,b)=>`I learned to ${b} near ${a}`, (_a,_b,c,d)=>`${c}, and with time ${d}`, (a)=>`There is a story inside ${a}`, (_a,b)=>`I carry it with me: ${b}`],
    country: italian
      ? [(a,b)=>`${b} sulla strada davanti a ${a}`, (_a,_b,c,d)=>`${c}, ma alla fine ${d}`, (a)=>`Ho lasciato ${a} nello specchietto`, (_a,b)=>`Con due cose in tasca, ${b}`]
      : [(a,b)=>`${b} on the road past ${a}`, (_a,_b,c,d)=>`${c}, but in the end ${d}`, (a)=>`I left ${a} in the rearview`, (_a,b)=>`With two things in my pocket, ${b}`],
    classical: italian
      ? [(a)=>`Nel silenzio appare ${a}`, (a,b)=>`${b}, mentre ${a} prende forma`, (_a,_b,c,d)=>`${c}; infine ${d}`, (_a,b)=>`Con misura, ${b}`]
      : [(a)=>`Inside the silence, ${a} appears`, (a,b)=>`${b}, while ${a} takes shape`, (_a,_b,c,d)=>`${c}; at last ${d}`, (_a,b)=>`With restraint, ${b}`],
    opera: italian
      ? [(a,b)=>`Davanti a ${a}, io ${b}`, (_a,_b,c)=>`Ah, se è vero che ${c}`, (_a,_b,c,d)=>`${c}; e tuttavia ${d}`, (a)=>`O cielo, guarda ${a}`]
      : [(a,b)=>`Before ${a}, I ${b}`, (_a,_b,c)=>`Ah, if it is true that ${c}`, (_a,_b,c,d)=>`${c}; and yet ${d}`, (a)=>`O sky, look upon ${a}`],
    gospel: italian
      ? [(a,b)=>`Quando vedo ${a}, io ${b}`, (_a,_b,c,d)=>`${c}, ma so che ${d}`, (a)=>`C’è una voce oltre ${a}`, (_a,b)=>`Insieme ${b}`]
      : [(a,b)=>`When I see ${a}, I ${b}`, (_a,_b,c,d)=>`${c}, but I know ${d}`, (a)=>`There is a voice beyond ${a}`, (_a,b)=>`Together ${b}`],
    cinematic: italian
      ? [(a,b)=>`${a}: da qui ${b}`, (_a,_b,c,d)=>`${c}, poi ${d}`, (a)=>`L’orizzonte si apre sopra ${a}`, (_a,b)=>`Adesso ${b}`]
      : [(a,b)=>`${a}: from here ${b}`, (_a,_b,c,d)=>`${c}, then ${d}`, (a)=>`The horizon opens above ${a}`, (_a,b)=>`Now ${b}`],
    experimental: italian
      ? [(a)=>a, (_a,b)=>b, (_a,_b,c)=>`(${c})`, (_a,_b,_c,d)=>`// ${d}`, (a,b)=>`${a} / ${b}`]
      : [(a)=>a, (_a,b)=>b, (_a,_b,c)=>`(${c})`, (_a,_b,_c,d)=>`// ${d}`, (a,b)=>`${a} / ${b}`],
    lounge: italian
      ? [(a,b)=>`${b} accanto a ${a}`, (_a,_b,c,d)=>`${c}, intanto ${d}`, (a)=>`Lascio scorrere ${a}`, (_a,b)=>`Senza fretta, ${b}`]
      : [(a,b)=>`${b} beside ${a}`, (_a,_b,c,d)=>`${c}, meanwhile ${d}`, (a)=>`I let ${a} drift by`, (_a,b)=>`No hurry, ${b}`],
    children: italian
      ? [(a)=>`Guarda, c’è ${a}!`, (_a,b)=>`Proviamo insieme: ${b}`, (_a,_b,c,d)=>`${c}, poi ${d}`, (a)=>`Quanti colori ha ${a}?`]
      : [(a)=>`Look, there is ${a}!`, (_a,b)=>`Let us try together: ${b}`, (_a,_b,c,d)=>`${c}, then ${d}`, (a)=>`How many colors does ${a} have?`],
    spoken: italian
      ? [(a,b)=>`Mi fermo davanti a ${a}. ${b}.`, (_a,_b,c,d)=>`${c}. E forse ${d}.`, (a)=>`Prendo nota di ${a}.`, (_a,b)=>`${b}. Senza spiegazioni.`]
      : [(a,b)=>`I stop in front of ${a}. ${b}.`, (_a,_b,c,d)=>`${c}. And perhaps ${d}.`, (a)=>`I make a note of ${a}.`, (_a,b)=>`${b}. No explanation.`]
  };

  const options = patterns[archetype];
  return options[index % options.length](image, motion, tension, release).replace(/\s+/g, ' ').trim();
}

function isHookSection(label: string): boolean {
  return /chorus|hook|coro|refrain|response|final/i.test(label);
}

export function buildProfessionalLyricsFallback(input: ProfessionalLyricsInput): string {
  if (input.vocalMode === 'instrumental') return '';
  const durationSec = Math.max(30, Math.min(480, Number(input.durationSec || 180)));
  const bpm = Math.max(40, Math.min(220, Number(input.bpm || 120)));
  const archetype = archetypeFor(input.genreFamily, input.genre, input.subgenre);
  const themeKey = moodGroup(input.mood);
  const italian = input.language === 'it' || input.language === 'nap';
  const theme = THEMES[themeKey][italian ? 'it' : 'en'];
  const seed = hash(`${input.genreFamily}|${input.genre}|${input.subgenre}|${input.mood}|${input.variant}|${durationSec}|${bpm}|${input.language}`);
  const rand = randomFactory(seed);
  const specs = blueprint(archetype, durationSec);
  const hook = pick(theme.hooks, rand);
  const secondHook = pick(theme.hooks.filter(item => item !== hook), rand);
  const blocks: string[] = [];

  for (let s = 0; s < specs.length; s += 1) {
    const spec = specs[s];
    const lines: string[] = [sectionTag(spec, input.vocalMode)];
    if (!spec.instrumental) {
      for (let i = 0; i < spec.lines; i += 1) {
        if (isHookSection(spec.label) && (i === 0 || i === Math.floor(spec.lines / 2))) {
          lines.push(i === 0 ? hook : secondHook);
        } else {
          lines.push(lineFor(archetype, theme, italian, rand, s * 11 + i));
        }
      }
    }
    blocks.push(lines.join('\n'));
  }

  const text = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length <= 4050) return text;
  const clipped = text.slice(0, 4050);
  const boundary = clipped.lastIndexOf('\n');
  return clipped.slice(0, boundary > 3500 ? boundary : 4050).trim();
}

function languageInstruction(code: string, languageName?: string): string {
  if (code === 'nap') return 'Write in authentic contemporary Neapolitan (Napulitano), with natural native spelling, idiom and singable prosody; do not simply write standard Italian.';
  if (code === 'it') return 'Write in natural contemporary Italian with native, singable prosody.';
  const label = String(languageName || code || 'English').trim();
  return `Write entirely in ${label}, with native vocabulary, idiom, pronunciation-friendly wording and singable prosody.`;
}

export function buildProfessionalLyricsInstruction(input: ProfessionalLyricsInput): string {
  const durationSec = Math.max(30, Math.min(480, Number(input.durationSec || 180)));
  const bpm = Math.max(40, Math.min(220, Number(input.bpm || 120)));
  const archetype = archetypeFor(input.genreFamily, input.genre, input.subgenre);
  const specs = blueprint(archetype, durationSec);
  const profile = getMusicStyleProfile(input.genreFamily, input.genre, input.subgenre);
  const targetLines = specs.reduce((sum, item) => sum + item.lines, 0);
  const sectionPlan = specs.map(item => `${item.label}${item.lines ? ` (${item.lines} lyric lines)` : ' (instrumental, no lyric lines)'}`).join(' -> ');
  const vocal = input.vocalMode === 'duet'
    ? 'Use genuinely distinct male and female parts. Alternate perspective naturally and reserve shared lines for emotional or rhythmic peaks.'
    : input.vocalMode === 'male'
      ? 'Write for one male lead voice with a register and phrasing natural to the selected style.'
      : input.vocalMode === 'female'
        ? 'Write for one female lead voice with a register and phrasing natural to the selected style.'
        : 'Instrumental mode: return an empty string.';

  return [
    'Write a completely original, release-ready song lyric for SONARA.',
    `Taxonomy: ${input.genreFamily} > ${input.genre} > ${input.subgenre}.`,
    `Atmosphere: ${input.mood}. Tempo: ${bpm} BPM. Intended duration: ${durationSec} seconds.`,
    `Professional style identity: ${profile.identity}`,
    `Rhythmic character: ${profile.rhythm}`,
    `Arrangement character: ${profile.arrangement}`,
    languageInstruction(input.language, input.languageName),
    vocal,
    `Use this exact structural logic, keeping the section tags in English exactly as bracketed labels: ${sectionPlan}.`,
    `Target roughly ${targetLines} actual lyric lines, adjusting line length to the style: rap may be denser; club, ambient and experimental styles should use shorter phrases and intentional instrumental space.`,
    'Write a coherent story or emotional progression. Verse 2 must develop new information; later sections must not merely paraphrase Verse 1.',
    'The chorus or hook must be memorable and singable, but do not repeat more than two identical lines inside a single section.',
    'Use concrete images, specific actions and human details. Avoid generic AI clichés such as “city lights calling our names”, “we are only getting started”, “fire in my veins”, “rise from the ashes”, “chasing dreams”, or empty references to the genre itself.',
    `Never write the words “${input.genre}” or “${input.subgenre}” merely to prove genre compliance. Make the genre audible through cadence, density, section design, vocabulary and attitude instead.`,
    'Do not mention artists, brands, copyrighted songs or imitate a specific living artist. Do not add explanations, markdown fences, commentary or a title. Output only bracketed section tags and lyrics.',
    'Keep the complete output below 4000 characters so it remains compatible with the music engine.'
  ].join('\n');
}

export function professionalLyricsArchetype(input: Pick<ProfessionalLyricsInput, 'genreFamily' | 'genre' | 'subgenre'>): Archetype {
  return archetypeFor(input.genreFamily, input.genre, input.subgenre);
}
