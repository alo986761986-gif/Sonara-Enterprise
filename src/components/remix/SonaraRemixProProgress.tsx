import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Circle, Clock3, LoaderCircle, ShieldCheck } from 'lucide-react';

type PhaseKey =
  | 'queued' | 'downloading' | 'analyzing' | 'separating'
  | 'arranging' | 'regenerating' | 'mastering' | 'uploading';

type Phase = { key: PhaseKey; name: string; detail: string; milestone: number };

const PHASES: readonly Phase[] = [
  { key: 'queued', name: 'Prenotazione GPU', detail: 'Richiesta salvata. In attesa che il worker MoLab prenda in carico il job.', milestone: 4 },
  { key: 'downloading', name: 'Recupero sorgenti', detail: 'Download privato dei brani A e B dal deposito Cloudflare R2.', milestone: 12 },
  { key: 'analyzing', name: 'Analisi musicale', detail: 'Lettura della struttura audio, del ritmo e dei riferimenti musicali.', milestone: 24 },
  { key: 'separating', name: 'Separazione tracce', detail: 'Demucs separa voci, batteria, basso e altri strumenti delle sorgenti.', milestone: 40 },
  { key: 'arranging', name: 'Piano di fusione A+B', detail: 'Preparazione della struttura musicale e del riferimento ritmico del brano A.', milestone: 57 },
  { key: 'regenerating', name: 'Generazione ACE-Step', detail: 'La GPU costruisce il nuovo accompagnamento e prepara la fusione originale A+B.', milestone: 72 },
  { key: 'mastering', name: 'Mix, master e controlli', detail: 'Composizione delle voci, mastering e verifica tecnica dell\'audio finale.', milestone: 86 },
  { key: 'uploading', name: 'Salvataggio privato', detail: 'Invio del master WAV e degli stem all\'archivio privato Cloudflare R2.', milestone: 93 },
] as const;

export type RemixProProgressJob = {
  jobId?: string;
  status?: string;
  stage?: string;
  progress?: number;
  createdAt?: number;
  requestedDurationSeconds?: number;
  actualDurationSeconds?: number;
  error?: string;
};

export type RemixProTransfer = {
  phase: 'a' | 'b' | 'registering';
  name: string;
  confirmedBytes: number;
  totalBytes: number;
};

const clampPercentage = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const timeLabel = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const durationLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export default function SonaraRemixProProgress({
  job, transfer, lastConfirmedAt, monitoringDelayed = false,
}: {
  job?: RemixProProgressJob | null;
  transfer?: RemixProTransfer | null;
  lastConfirmedAt?: number | null;
  monitoringDelayed?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status]);

  const stageIndex = useMemo(
    () => PHASES.findIndex(phase => phase.key === job?.stage),
    [job?.stage],
  );
  const finished = job?.status === 'COMPLETED';
  const failed = job?.status === 'FAILED';
  const pending = !finished && !failed;
  const knownStage = stageIndex >= 0;
  const activePhase = knownStage ? PHASES[stageIndex] : null;
  const validCreatedAt = typeof job?.createdAt === 'number'
    && job.createdAt > 0 && job.createdAt <= now + 60000;
  const elapsed = validCreatedAt ? timeLabel(now - job!.createdAt!) : null;

  if (!job && !transfer) return null;

  if (transfer && !job) {
    const registering = transfer.phase === 'registering';
    const currentName = transfer.phase === 'a' ? 'brano A' : 'brano B';
    const percentage = registering || transfer.totalBytes <= 0
      ? null
      : clampPercentage(100 * transfer.confirmedBytes / transfer.totalBytes);
    return (
      <section className="sonara-pro-progress-card" aria-label="Caricamento sorgenti Remix Pro" data-testid="sonara-pro-live-progress">
        <header className="sonara-pro-progress-header">
          <div>
            <span className="sonara-pro-eyebrow">PREPARAZIONE PRIVATA</span>
            <h3>{registering ? 'Registrazione della richiesta' : `Caricamento ${currentName}`}</h3>
            <p>{registering
              ? 'Entrambi i file sono stati caricati. Attendiamo la conferma del job dal server.'
              : 'Avanzamento calcolato sui byte confermati dal server, non sui byte soltanto inviati dal browser.'}</p>
          </div>
          <span className="sonara-pro-state-pill">
            <LoaderCircle size={14} className="sonara-pro-spin" aria-hidden="true" />
            {registering ? 'CONFERMA IN CORSO' : 'UPLOAD IN CORSO'}
          </span>
        </header>
        <div className="sonara-pro-progress-readout">
          <span>{registering ? 'Accodamento autenticato' : transfer.name}</span>
          <strong data-testid="sonara-pro-progress-percent">
            {percentage === null ? '—' : `${percentage}%`}
          </strong>
        </div>
        <div className={`sonara-pro-meter${percentage === null ? ' sonara-pro-meter-wait' : ''}`}
          role={percentage === null ? 'status' : 'progressbar'}
          aria-label={registering ? 'Registrazione della richiesta in corso' : `Upload ${currentName}`}
          {...(percentage !== null ? { 'aria-valuenow': percentage, 'aria-valuemin': 0, 'aria-valuemax': 100 } : {})}>
          <span style={{ width: `${percentage ?? 10}%` }} />
        </div>
        <div className="sonara-pro-meter-footnote">
          <ShieldCheck size={15} aria-hidden="true" />
          {registering
            ? 'Nessun job viene considerato avviato prima della conferma.'
            : `${(transfer.confirmedBytes / 1048576).toFixed(1)} / ${(transfer.totalBytes / 1048576).toFixed(1)} MiB confermati`}
        </div>
      </section>
    );
  }

  if (!job) return null;
  const backendPercent = pending && knownStage ? clampPercentage(job.progress) : null;
  const confirmedPhases = finished ? PHASES.length : knownStage ? stageIndex : 0;
  const title = finished ? 'Master pronto nel tuo archivio'
    : failed ? 'Elaborazione interrotta'
    : job.stage === 'reconciling' ? 'Verifica della prenotazione'
    : activePhase?.name || 'Attesa aggiornamento del server';
  const detail = finished ? 'Il master è stato confermato dal server. Ora puoi ascoltarlo e modificarlo.'
    : failed ? (job.error || 'Il lavoro non è riuscito. Il master non è stato pubblicato.')
    : job.stage === 'reconciling' ? 'Il server sta verificando la registrazione del job. Non inviarne un duplicato.'
    : activePhase?.detail || 'Aspettiamo uno stato ufficiale prima di mostrare avanzamenti.';
  const label = finished ? 'COMPLETATO' : failed ? 'NON COMPLETATO'
    : monitoringDelayed ? 'SINCRONIZZAZIONE LENTA' : 'ELABORAZIONE IN CORSO';

  return (
    <section className={`sonara-pro-progress-card${failed ? ' sonara-pro-progress-failed' : ''}`}
      aria-label="Avanzamento reale del remix" data-testid="sonara-pro-live-progress"
      data-sonara-pro-stage={job.stage || 'unknown'}>
      <header className="sonara-pro-progress-header">
        <div className="sonara-pro-progress-intro">
          <span className="sonara-pro-eyebrow">MONITORAGGIO DELLA PRODUZIONE</span>
          <h3 aria-live="polite">{title}</h3>
          <p>{detail}</p>
        </div>
        <span className={`sonara-pro-state-pill${finished ? ' sonara-pro-state-done' : ''}${failed ? ' sonara-pro-state-error' : ''}`}>
          {finished ? <Check size={14} aria-hidden="true"/> : failed
            ? <AlertCircle size={14} aria-hidden="true"/>
            : <LoaderCircle size={14} className="sonara-pro-spin" aria-hidden="true"/>}
          {label}
        </span>
      </header>

      <div className="sonara-pro-progress-readout">
        <div className="sonara-pro-progress-stage-number">
          <span>{finished ? 'TUTTE LE FASI CONFERMATE' : failed ? 'LAVORO INTERROTTO'
            : knownStage ? `FASE ${stageIndex + 1} DI ${PHASES.length}` : 'STATO IN VERIFICA'}</span>
          <small>{finished ? 'Verificato dal gateway' : failed ? 'Nessun master pubblicato'
            : 'Stato comunicato dal gateway SONARA'}</small>
        </div>
        <strong data-testid="sonara-pro-progress-percent">
          {finished ? '100%' : failed ? '—' : backendPercent !== null ? `${backendPercent}%` : '—'}
        </strong>
      </div>

      <div className={`sonara-pro-meter${pending && backendPercent === null ? ' sonara-pro-meter-wait' : ''}`}
        role={failed || backendPercent === null && !finished ? 'status' : 'progressbar'}
        aria-label="Avanzamento per traguardi confermati dal gateway"
        {...(!failed && (finished || backendPercent !== null)
          ? { 'aria-valuenow': finished ? 100 : backendPercent!, 'aria-valuemin': 0, 'aria-valuemax': 100 } : {})}>
        <span style={{ width: `${finished ? 100 : failed ? 0 : backendPercent ?? 10}%` }} />
      </div>

      <div className="sonara-pro-progress-facts">
        <span><Clock3 size={15} aria-hidden="true" />
          {elapsed ? `Trascorsi ${elapsed}` : 'Tempo trascorso non disponibile'}</span>
        <span><ShieldCheck size={15} aria-hidden="true" />
          {job.requestedDurationSeconds && job.requestedDurationSeconds > 0
            ? `Durata richiesta ${durationLabel(job.requestedDurationSeconds)}`
            : 'Durata in verifica'}</span>
        {lastConfirmedAt && lastConfirmedAt > 0 && <span className={monitoringDelayed ? 'sonara-pro-fact-warning' : ''}>
          <Check size={15} aria-hidden="true"/>
          {monitoringDelayed ? 'Ultima risposta server ' : 'Risposta server '}
          {new Date(lastConfirmedAt).toLocaleTimeString('it-IT')}</span>}
      </div>

      <div className="sonara-pro-phases" aria-label="Fasi operative della generazione">
        {PHASES.map((phase, index) => {
          const done = finished || !failed && knownStage && index < stageIndex;
          const active = !failed && !finished && index === stageIndex;
          return (
            <div key={phase.key} className={`sonara-pro-phase${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
              data-testid={`sonara-pro-phase-${phase.key}`}>
              <span className="sonara-pro-phase-icon" aria-hidden="true">
                {done ? <Check size={16}/> : active ? <LoaderCircle size={16} className="sonara-pro-spin"/> : <Circle size={13}/>}
              </span>
              <div className="sonara-pro-phase-body">
                <span className="sonara-pro-phase-index">{String(index + 1).padStart(2, '0')}</span>
                <strong>{phase.name}</strong>
                {active && <p>{phase.detail}</p>}
                {done && <small>Fase superata</small>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sonara-pro-meter-footnote">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>La percentuale indica i traguardi comunicati dal gateway; non è una stima del tempo residuo o della percentuale interna di ACE-Step. Durante una fase lunga rimane stabile finché arriva un nuovo stato verificato.</span>
      </div>
    </section>
  );
}
