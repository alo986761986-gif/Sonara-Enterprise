import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileAudio,
  FileJson,
  FileText,
  HardDrive,
  Library,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import {
  GENERATED_ASSET_EVENT,
  downloadStoredAsset,
  listGeneratedProjects,
  type GeneratedProjectArchive,
  type StoredGeneratedAsset
} from '../../services/generatedAssetVault';

function formatBytes(value: number): string {
  if (!value) return 'Riferimento sicuro';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function AssetIcon({ asset }: { asset: StoredGeneratedAsset }) {
  if (asset.kind === 'audio') return <FileAudio className="h-4 w-4 text-purple-300" />;
  if (asset.kind === 'metadata') return <FileJson className="h-4 w-4 text-cyan-300" />;
  return <FileText className="h-4 w-4 text-slate-300" />;
}

export default function GeneratedAssetLibrary() {
  const [projects, setProjects] = useState<GeneratedProjectArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await listGeneratedProjects());
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Impossibile leggere l’archivio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const updateHandler = () => void refresh();
    window.addEventListener(GENERATED_ASSET_EVENT, updateHandler);
    return () => window.removeEventListener(GENERATED_ASSET_EVENT, updateHandler);
  }, [refresh]);

  const totals = useMemo(() => {
    const files = projects.flatMap(project => project.assets);
    return {
      projects: projects.length,
      files: files.length,
      offline: files.filter(file => file.storedOffline).length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0)
    };
  }, [projects]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [Library, 'Progetti salvati', totals.projects, 'Ogni generazione resta disponibile'],
          [FileAudio, 'File archiviati', totals.files, 'Master, stems e output rilevati'],
          [HardDrive, 'Copie persistenti', totals.offline, 'Conservate nel dispositivo'],
          [Database, 'Spazio archivio', formatBytes(totals.bytes), 'Dati audio e metadati']
        ].map(([Icon, label, value, text]: any) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <Icon className="h-5 w-5 text-purple-400" />
            <div className="mt-3 text-2xl font-black text-white">{value}</div>
            <div className="text-xs font-bold text-slate-300">{label}</div>
            <div className="mt-1 text-[10px] leading-4 text-slate-500">{text}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="text-sm font-bold text-emerald-200">Archivio automatico attivo</div>
            <div className="mt-1 text-[11px] text-slate-400">Al termine di ogni generazione SONARA salva i file rilevati e il JSON completo della sessione.</div>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Aggiorna archivio
        </button>
      </div>

      {notice && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">{notice}</div>}

      {!loading && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-12 text-center">
          <Library className="mx-auto h-9 w-9 text-slate-600" />
          <div className="mt-4 text-sm font-bold text-white">L’archivio è pronto</div>
          <div className="mt-2 text-xs text-slate-500">Genera il primo brano: apparirà qui automaticamente con tutti i file disponibili.</div>
        </div>
      )}

      <div className="space-y-4">
        {projects.map(project => (
          <article key={project.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-white">{project.title}</h3>
                  <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-300">{project.bpm} BPM</span>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{project.keySignature}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{project.genre} / {project.subgenre} · {project.durationSec}s · Job {project.jobId}</div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500"><Clock3 className="h-3.5 w-3.5" />{formatDate(project.updatedAt)}</div>
            </div>

            <div className="divide-y divide-slate-800/80">
              {project.assets.map(asset => (
                <div key={asset.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-2"><AssetIcon asset={asset} /></div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-200">{asset.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span>{asset.label}</span><span>·</span><span>{asset.format.toUpperCase()}</span><span>·</span><span>{formatBytes(asset.bytes)}</span>
                        {asset.storedOffline && <span className="inline-flex items-center gap-1 font-bold text-emerald-400"><CheckCircle2 className="h-3 w-3" />Salvato</span>}
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => downloadStoredAsset(asset)} disabled={!asset.blob && !asset.remoteUrl} className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/20 disabled:opacity-40">
                    <Download className="h-4 w-4" />Scarica
                  </button>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
