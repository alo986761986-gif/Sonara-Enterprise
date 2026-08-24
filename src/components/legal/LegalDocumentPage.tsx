import React, { useEffect } from 'react';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, FileText, LockKeyhole, Mail, Printer, ShieldCheck } from 'lucide-react';
import { legalConfig, legalDocumentReady, legalValue, missingLegalFields } from '../../legal/legalConfig';

type LegalKind = 'terms' | 'privacy';

const Section = ({ number, title, children }: { number: string; title: string; children: React.ReactNode }) => (
  <section className="scroll-mt-24 border-t border-slate-800 py-7 first:border-t-0 first:pt-0">
    <div className="flex items-start gap-3">
      <span className="flex h-7 min-w-7 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 text-[10px] font-black text-purple-200">{number}</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-black tracking-tight text-white sm:text-lg">{title}</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">{children}</div>
      </div>
    </div>
  </section>
);

const BulletList = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-2 pl-5 marker:text-purple-400">{children}</ul>;

function OperatorCard() {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/65 p-4 text-xs sm:grid-cols-2">
      <div><span className="block text-slate-600">Titolare / Fornitore</span><strong className="mt-1 block text-slate-100">{legalValue(legalConfig.operatorName, 'nome o ragione sociale')}</strong></div>
      <div><span className="block text-slate-600">Partita IVA / Codice fiscale</span><strong className="mt-1 block text-slate-100">{legalValue(legalConfig.taxId, 'identificativo fiscale')}</strong></div>
      <div><span className="block text-slate-600">Sede</span><strong className="mt-1 block text-slate-100">{legalValue(legalConfig.address, 'indirizzo completo')}</strong></div>
      <div><span className="block text-slate-600">Contatto</span><strong className="mt-1 block break-all text-slate-100">{legalValue(legalConfig.contactEmail, 'email di assistenza')}</strong></div>
    </div>
  );
}

function TermsDocument() {
  return (
    <>
      <Section number="1" title="Fornitore e ambito del servizio">
        <p>Le presenti Condizioni regolano l’accesso e l’utilizzo di SONARA Enterprise (“SONARA”), piattaforma online per generazione musicale assistita da intelligenza artificiale, elaborazione audio, EQ/Master, assistenza Ember e gestione delle produzioni.</p>
        <OperatorCard />
      </Section>
      <Section number="2" title="Accettazione e requisiti dell’utente">
        <p>Creando un account o acquistando un piano, l’utente dichiara di avere letto e accettato queste Condizioni e l’Informativa Privacy. Per acquistare un abbonamento l’utente deve avere almeno 18 anni o agire con l’autorizzazione e sotto la responsabilità del proprio rappresentante legale.</p>
      </Section>
      <Section number="3" title="Account e sicurezza">
        <BulletList>
          <li>L’utente deve fornire informazioni corrette e mantenere sicuri i propri metodi di accesso.</li>
          <li>L’account è personale e non può essere ceduto o condiviso per aggirare quote e limiti.</li>
          <li>SONARA può richiedere la verifica dell’email e sospendere accessi anomali o non autorizzati.</li>
        </BulletList>
      </Section>
      <Section number="4" title="Piani, minuti e funzionalità">
        <p>I piani disponibili, i prezzi, i minuti inclusi e la durata massima dei brani sono mostrati nella pagina Piani prima dell’acquisto. Un minuto corrisponde a sessanta secondi di audio richiesto al motore.</p>
        <BulletList>
          <li>Free: 10 minuti mensili, brani fino a 60 secondi, uso personale.</li>
          <li>Creator: 120 minuti mensili, brani fino a 4 minuti e utilizzo commerciale nei limiti di queste Condizioni.</li>
          <li>Studio: 500 minuti mensili, brani fino a 4 minuti e utilizzo ad alto volume.</li>
        </BulletList>
        <p>I minuti non utilizzati scadono alla fine del periodo e non vengono trasferiti al periodo successivo. Le richieste che il motore non riesce ad avviare per errore tecnico non vengono addebitate; una generazione correttamente avviata può essere conteggiata anche se il risultato creativo non soddisfa le preferenze soggettive dell’utente.</p>
      </Section>
      <Section number="5" title="Prezzi, pagamento e rinnovo">
        <p>I prezzi applicabili, comprensivi o meno di imposte secondo quanto indicato nel Checkout, sono mostrati prima della conferma. I pagamenti sono elaborati da Stripe. Gli abbonamenti si rinnovano automaticamente con la frequenza scelta finché non vengono annullati.</p>
        <p>L’utente può aggiornare il metodo di pagamento, cambiare piano o annullare il rinnovo dal Customer Portal. L’annullamento ha effetto alla fine del periodo già pagato, salvo diversa indicazione obbligatoria di legge.</p>
      </Section>
      <Section number="6" title="Recesso, rimborsi e pagamenti non riusciti">
        <p>Restano salvi tutti i diritti inderogabili riconosciuti ai consumatori dalla normativa applicabile, incluso l’eventuale diritto di recesso. Le richieste devono essere inviate al contatto indicato nel presente documento. I rimborsi non dovuti per legge possono essere valutati in base alle circostanze, all’utilizzo del servizio e agli eventuali malfunzionamenti verificati.</p>
        <p>In caso di pagamento non riuscito, SONARA può limitare le funzionalità a pagamento fino alla regolarizzazione. Le fatture e le ricevute restano disponibili nel Customer Portal quando previsto da Stripe.</p>
      </Section>
      <Section number="7" title="Contenuti forniti dall’utente">
        <p>L’utente conserva i diritti sui prompt, testi, audio e altri contenuti legittimamente forniti. Con il caricamento concede a SONARA una licenza limitata, non esclusiva e necessaria esclusivamente per elaborare, archiviare e consegnare il risultato richiesto.</p>
        <p>L’utente garantisce di avere i diritti necessari e di non caricare contenuti che violino copyright, marchi, privacy, diritti della personalità o altre norme.</p>
      </Section>
      <Section number="8" title="Musica generata e utilizzo commerciale">
        <p>Per i brani generati durante un piano Creator o Studio attivo, SONARA autorizza l’utilizzo personale e commerciale dell’output nella misura consentita dalla legge, dalle licenze tecnologiche applicabili e dai diritti di terzi. L’autorizzazione relativa a un brano validamente generato non viene meno per il solo successivo annullamento del piano.</p>
        <BulletList>
          <li>SONARA non garantisce che un output sia unico, esclusivo o proteggibile tramite copyright.</li>
          <li>L’utente deve verificare l’assenza di conflitti prima di pubblicazioni, registrazioni, sincronizzazioni o campagne commerciali rilevanti.</li>
          <li>È vietato chiedere imitazioni ingannevoli di artisti viventi, usare voci o identità senza autorizzazione o rivendicare diritti su materiale altrui.</li>
          <li>I brani creati con il piano Free sono destinati all’uso personale e non commerciale.</li>
        </BulletList>
      </Section>
      <Section number="9" title="Usi vietati">
        <BulletList>
          <li>Attività illegali, fraudolente, diffamatorie, discriminatorie o lesive.</li>
          <li>Violazione di diritti d’autore, privacy, identità, marchi o segreti commerciali.</li>
          <li>Aggiramento di autenticazione, quote, pagamenti o protezioni tecniche.</li>
          <li>Reverse engineering abusivo, attacchi, scraping massivo o sovraccarico dell’infrastruttura.</li>
          <li>Creazione o diffusione di contenuti ingannevoli senza le necessarie informazioni sulla loro origine artificiale quando richiesto dalla legge.</li>
        </BulletList>
      </Section>
      <Section number="10" title="Disponibilità, manutenzione e modifiche">
        <p>SONARA mira a offrire continuità professionale, ma i servizi di intelligenza artificiale possono subire manutenzione, code, indisponibilità di fornitori o variazioni tecniche. Le funzionalità possono essere aggiornate per sicurezza, qualità, conformità o sostenibilità operativa, senza ridurre retroattivamente i diritti già maturati sui brani validamente generati.</p>
      </Section>
      <Section number="11" title="Sospensione e chiusura">
        <p>SONARA può sospendere o chiudere un account in caso di violazioni gravi, frode, mancato pagamento, rischi di sicurezza o obblighi di legge. Quando ragionevolmente possibile, l’utente riceverà informazioni sul motivo e potrà esportare i dati disponibili, salvo esigenze di sicurezza o divieti normativi.</p>
      </Section>
      <Section number="12" title="Garanzie e responsabilità">
        <p>Gli strumenti generativi producono risultati probabilistici. SONARA non garantisce l’idoneità dell’output a uno specifico scopo artistico, commerciale o legale. Nessuna disposizione limita la responsabilità che non può essere esclusa secondo la legge applicabile, né i diritti inderogabili dei consumatori.</p>
      </Section>
      <Section number="13" title="Legge applicabile e controversie">
        <p>Le presenti Condizioni sono regolate dalla legge italiana, fatti salvi i diritti inderogabili riconosciuti al consumatore dalla legge del Paese di residenza abituale. Per i consumatori resta competente il foro previsto dalla normativa applicabile; per gli altri utenti si applica il foro della sede del fornitore, se consentito.</p>
      </Section>
      <Section number="14" title="Modifiche e contatti">
        <p>Le modifiche sostanziali saranno comunicate con un preavviso ragionevole. La versione applicabile è indicata in apertura. Per assistenza, recesso, contestazioni o comunicazioni legali scrivere a <strong className="text-white">{legalValue(legalConfig.contactEmail, 'email di assistenza')}</strong>.</p>
      </Section>
    </>
  );
}

function PrivacyDocument() {
  return (
    <>
      <Section number="1" title="Titolare del trattamento">
        <p>Questa informativa descrive il trattamento dei dati personali degli utenti di SONARA ai sensi del Regolamento (UE) 2016/679 (“GDPR”).</p>
        <OperatorCard />
      </Section>
      <Section number="2" title="Dati trattati">
        <BulletList>
          <li>Dati account: identificativo Firebase, email, nome visualizzato, immagine profilo e provider di accesso.</li>
          <li>Dati contrattuali e di pagamento: piano, stato dell’abbonamento, identificativi Stripe, fatture e storico degli eventi. SONARA non memorizza i dati completi della carta.</li>
          <li>Dati creativi: prompt, testi, parametri musicali, preferenze, metadati, audio generato e richieste rivolte a Ember.</li>
          <li>Dati tecnici: indirizzo IP, log di sicurezza, dispositivo, browser, data e ora, errori e informazioni necessarie al funzionamento.</li>
          <li>Dati salvati localmente: preferenze, profilo e archivio delle produzioni conservati nel browser tramite localStorage e IndexedDB.</li>
        </BulletList>
      </Section>
      <Section number="3" title="Finalità e basi giuridiche">
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-slate-900 text-slate-400"><tr><th className="p-3">Finalità</th><th className="p-3">Dati</th><th className="p-3">Base giuridica</th></tr></thead>
            <tbody className="divide-y divide-slate-800"><tr><td className="p-3">Account, generazione, salvataggio e assistenza</td><td className="p-3">Account, contenuti creativi, log</td><td className="p-3">Esecuzione del contratto</td></tr><tr><td className="p-3">Pagamenti, rinnovi e fatturazione</td><td className="p-3">Dati contrattuali e Stripe</td><td className="p-3">Contratto e obblighi legali</td></tr><tr><td className="p-3">Sicurezza, prevenzione frodi e abusi</td><td className="p-3">Log, IP, account, eventi</td><td className="p-3">Legittimo interesse e obblighi legali</td></tr><tr><td className="p-3">Preferenze facoltative e miglioramento modelli</td><td className="p-3">Solo dati autorizzati dall’utente</td><td className="p-3">Consenso revocabile</td></tr><tr><td className="p-3">Comunicazioni operative</td><td className="p-3">Email e stato servizio</td><td className="p-3">Contratto e legittimo interesse</td></tr></tbody>
          </table>
        </div>
      </Section>
      <Section number="4" title="Fornitori e destinatari">
        <p>I dati possono essere trattati, secondo il servizio utilizzato, da fornitori incaricati dell’autenticazione, hosting, sicurezza, pagamenti e intelligenza artificiale, tra cui:</p>
        <BulletList>
          <li>Google Firebase per autenticazione, database e storage.</li>
          <li>Stripe per Checkout, abbonamenti, prevenzione frodi, fatture e Customer Portal.</li>
          <li>Vercel e Cloudflare per hosting, distribuzione, sicurezza e log tecnici.</li>
          <li>OpenAI per le funzioni conversazionali e vocali di Ember, quando attivate.</li>
          <li>Modal e i fornitori di infrastruttura GPU per l’elaborazione musicale.</li>
        </BulletList>
        <p>I fornitori operano secondo i rispettivi ruoli, accordi sul trattamento e informative. I dati possono inoltre essere comunicati ad autorità o consulenti quando richiesto dalla legge o necessario per tutelare diritti.</p>
      </Section>
      <Section number="5" title="Trasferimenti internazionali">
        <p>Alcuni fornitori possono trattare dati al di fuori dello Spazio Economico Europeo. In tali casi il trasferimento avviene sulla base di una decisione di adeguatezza, clausole contrattuali standard o altro meccanismo previsto dal GDPR, secondo le condizioni del fornitore coinvolto.</p>
      </Section>
      <Section number="6" title="Conservazione">
        <BulletList>
          <li>I dati dell’account sono conservati per la durata del rapporto e successivamente per il tempo necessario a obblighi legali o tutela dei diritti.</li>
          <li>I dati contabili e di pagamento sono conservati per i periodi richiesti dalla normativa fiscale e amministrativa.</li>
          <li>I log di sicurezza sono conservati per un periodo proporzionato alla prevenzione e gestione di incidenti.</li>
          <li>L’archivio locale rimane sul dispositivo fino alla cancellazione dell’utente, alla rimozione dei dati del sito o alla perdita dello storage del browser.</li>
          <li>Prompt e output trasmessi ai fornitori possono seguire i tempi di conservazione previsti dai rispettivi accordi e impostazioni del servizio.</li>
        </BulletList>
      </Section>
      <Section number="7" title="Cookie e memoria del browser">
        <p>SONARA utilizza strumenti tecnici necessari all’autenticazione, sicurezza e memorizzazione delle preferenze, inclusi localStorage e IndexedDB. Eventuali strumenti analitici o di marketing non strettamente necessari saranno attivati soltanto con una base giuridica adeguata e, quando richiesto, previo consenso.</p>
      </Section>
      <Section number="8" title="Intelligenza artificiale e contenuti creativi">
        <p>I prompt, i testi, l’audio e il contesto di studio vengono elaborati per fornire la generazione o la risposta richiesta. L’opzione “Miglioramento dei modelli” è disattivata per impostazione predefinita nell’interfaccia SONARA; un eventuale utilizzo ulteriore richiede una scelta separata e revocabile dell’utente.</p>
        <p>SONARA non adotta decisioni esclusivamente automatizzate che producano effetti giuridici o analogamente significativi sull’utente. I risultati creativi rimangono suggerimenti e produzioni probabilistiche.</p>
      </Section>
      <Section number="9" title="Sicurezza">
        <p>Sono adottate misure tecniche e organizzative proporzionate, tra cui autenticazione Firebase, verifica server dei token, segreti separati dal codice, webhook Stripe firmati, controllo delle quote e limitazione delle richieste. Nessun sistema può garantire sicurezza assoluta; gli incidenti vengono gestiti secondo gli obblighi applicabili.</p>
      </Section>
      <Section number="10" title="Diritti dell’interessato">
        <p>Nei casi previsti dal GDPR l’utente può chiedere accesso, rettifica, cancellazione, limitazione, portabilità, opposizione e revoca del consenso, senza pregiudicare la liceità del trattamento precedente. Le richieste possono essere inviate a <strong className="text-white">{legalValue(legalConfig.contactEmail, 'email privacy')}</strong> e saranno gestite nei termini di legge.</p>
      </Section>
      <Section number="11" title="Reclamo all’autorità">
        <p>L’utente può proporre reclamo al Garante per la protezione dei dati personali o all’autorità competente del proprio Stato membro. Informazioni e modalità sono disponibili sul sito ufficiale <a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer" className="font-bold text-purple-300 hover:text-purple-200">garanteprivacy.it</a>.</p>
      </Section>
      <Section number="12" title="Minori">
        <p>Gli abbonamenti non sono destinati all’acquisto autonomo da parte di minori. Se SONARA viene utilizzata da un minore, il trattamento e l’acquisto devono avvenire con l’intervento del rappresentante legale secondo la normativa applicabile.</p>
      </Section>
      <Section number="13" title="Aggiornamenti e contatti">
        <p>Questa informativa può essere aggiornata per modifiche normative, tecniche o organizzative. Le variazioni sostanziali saranno rese visibili nel servizio. Per informazioni sul trattamento dei dati scrivere a <strong className="text-white">{legalValue(legalConfig.contactEmail, 'email privacy')}</strong>.</p>
      </Section>
    </>
  );
}

export default function LegalDocumentPage({ kind }: { kind: LegalKind }) {
  const isTerms = kind === 'terms';
  useEffect(() => {
    document.documentElement.lang = 'it';
    document.documentElement.dir = 'ltr';
    document.title = `${isTerms ? 'Termini e Condizioni' : 'Informativa Privacy'} · SONARA AI`;
  }, [isTerms]);

  return (
    <div className="min-h-screen bg-[#050812] text-slate-100 print:bg-white print:text-black">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#080d18]/95 backdrop-blur-xl print:static print:bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-3 text-white"><img src="/sonara-ai-icon.png" alt="SONARA AI" className="h-10 w-10 rounded-xl object-cover" /><span><strong className="block text-sm font-black tracking-wide">SONARA AI</strong><span className="text-[10px] text-purple-300">DOCUMENTI LEGALI</span></span></a>
          <div className="flex gap-2"><a href="/" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold print:hidden"><ArrowLeft className="h-4 w-4" />Torna al sito</a><button type="button" onClick={() => window.print()} className="hidden items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-100 sm:inline-flex print:hidden"><Printer className="h-4 w-4" />Stampa</button></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {!legalDocumentReady && <div className="mb-6 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100 print:border-black print:bg-white"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong className="block font-black">BOZZA NON ANCORA ABILITATA AI PAGAMENTI</strong><span className="mt-1 block text-xs leading-5 text-amber-200/80">Mancano: {missingLegalFields.join(', ')}. Il backend mantiene Checkout disabilitato finché i dati non sono completi e la pubblicazione non viene confermata.</span></div></div></div>}

        <div className="mb-7 flex flex-wrap gap-2"><a href="/terms" className={`rounded-full border px-3 py-1.5 text-xs font-black ${isTerms ? 'border-purple-400 bg-purple-500/15 text-white' : 'border-slate-700 text-slate-400'}`}>Termini e Condizioni</a><a href="/privacy" className={`rounded-full border px-3 py-1.5 text-xs font-black ${!isTerms ? 'border-purple-400 bg-purple-500/15 text-white' : 'border-slate-700 text-slate-400'}`}>Informativa Privacy</a></div>

        <article className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl print:border-slate-300 print:bg-white print:shadow-none">
          <div className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,.23),transparent_45%)] p-6 sm:p-9 print:bg-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10 text-purple-300">{isTerms ? <FileText className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}</div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl print:text-black">{isTerms ? 'Termini e Condizioni' : 'Informativa Privacy'}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 print:text-slate-700">{isTerms ? 'Regole trasparenti per account, abbonamenti, generazione musicale e utilizzo delle produzioni SONARA.' : 'Informazioni sul trattamento dei dati personali, sui fornitori tecnologici e sui diritti degli utenti SONARA.'}</p>
            <div className="mt-5 flex flex-wrap gap-3 text-[10px] font-bold text-slate-500"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Versione {legalConfig.version}</span><span>Decorrenza: {legalConfig.effectiveDate}</span><span>Paese: {legalConfig.country}</span></div>
          </div>
          <div className="p-6 sm:p-9">{isTerms ? <TermsDocument /> : <PrivacyDocument />}</div>
        </article>

        <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><ShieldCheck className="h-5 w-5 text-emerald-400" /><strong className="mt-3 block text-xs text-white">Pagamenti protetti</strong><span className="mt-1 block text-[10px] leading-5 text-slate-500">Checkout e fatturazione gestiti da Stripe.</span></div><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><Bot className="h-5 w-5 text-purple-400" /><strong className="mt-3 block text-xs text-white">AI trasparente</strong><span className="mt-1 block text-[10px] leading-5 text-slate-500">Limiti chiari su output, unicità e diritti.</span></div><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><Mail className="h-5 w-5 text-cyan-400" /><strong className="mt-3 block text-xs text-white">Contatto diretto</strong><span className="mt-1 block break-all text-[10px] leading-5 text-slate-500">{legalValue(legalConfig.contactEmail, 'email di assistenza')}</span></div></div>
      </main>
    </div>
  );
}
