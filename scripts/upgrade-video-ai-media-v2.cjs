const fs = require('node:fs');

function patchFile(path, patches) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of patches) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`[Video AI media v2] ${path}: patch not found: ${label}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patchFile('src/components/video/VideoAISectionControl.tsx', [
  [
    "import { ArrowDown, ArrowUp, BrainCircuit, Download, Film, ImagePlus, Loader2, Play, Shuffle, Sparkles, Trash2, Upload, Video, WandSparkles, X } from 'lucide-react';",
    "import { ArrowDown, ArrowUp, BrainCircuit, CheckCircle2, Download, Film, ImagePlus, Loader2, Music2, Play, Shuffle, Sparkles, Trash2, Upload, Video, WandSparkles, X } from 'lucide-react';",
    'audio/status icons'
  ],
  [
    "  sourceKind: 'image' | 'video';\n  sourceName: string;\n  previewUrl: string;\n  storagePath: string;\n  contentType: string;\n  originalStoragePath?: string;",
    "  sourceKind: 'image' | 'video' | 'audio';\n  sourceName: string;\n  previewUrl: string;\n  storagePath: string;\n  contentType: string;\n  size: number;\n  originalStoragePath?: string;",
    'media reference audio and size'
  ],
  [
    "const MAX_MEDIA_REFERENCES = 3;\nconst MAX_IMAGE_BYTES = 15 * 1024 * 1024;\nconst MAX_VIDEO_BYTES = 150 * 1024 * 1024;",
    "const MAX_MEDIA_REFERENCES = 6;\nconst MAX_IMAGE_BYTES = 15 * 1024 * 1024;\nconst MAX_VIDEO_BYTES = 150 * 1024 * 1024;\nconst MAX_AUDIO_BYTES = 250 * 1024 * 1024;\nconst AUDIO_EXTENSION_RE = /\\.(mp3|wav|wave|flac|aac|m4a|mp4a|ogg|oga|opus|aiff|aif|alac|wma|amr|ape|mka|caf|weba|3ga|mid|midi)$/i;\nconst VIDEO_EXTENSION_RE = /\\.(mp4|webm|mov|m4v|avi|mkv)$/i;\nconst IMAGE_EXTENSION_RE = /\\.(jpe?g|png|webp)$/i;\n\nfunction formatBytes(bytes: number) {\n  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';\n  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;\n  return `${Math.max(1, Math.round(bytes / 1024))} KB`;\n}",
    'limits and format helpers'
  ],
  [
    "      setError(`Puoi usare fino a ${MAX_MEDIA_REFERENCES} riferimenti visivi per ogni generazione.`);",
    "      setError(`Puoi caricare fino a ${MAX_MEDIA_REFERENCES} file per ogni generazione.`);",
    'slot error copy'
  ],
  [
    "        const isImage = file.type.startsWith('image/');\n        const isVideo = file.type.startsWith('video/');\n        if (!isImage && !isVideo) throw new Error(`${file.name}: usa un file immagine o video.`);\n        if (isImage && file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: foto troppo grande. Massimo 15 MB.`);\n        if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: video troppo grande. Massimo 150 MB.`);",
    "        const isImage = file.type.startsWith('image/') || IMAGE_EXTENSION_RE.test(file.name);\n        const isVideo = file.type.startsWith('video/') || VIDEO_EXTENSION_RE.test(file.name);\n        const isAudio = file.type.startsWith('audio/') || AUDIO_EXTENSION_RE.test(file.name);\n        if (!isImage && !isVideo && !isAudio) throw new Error(`${file.name}: formato non riconosciuto. Usa foto, video o audio.`);\n        if (isImage && file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: foto troppo grande. Massimo 15 MB.`);\n        if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: video troppo grande. Massimo 150 MB.`);\n        if (isAudio && file.size > MAX_AUDIO_BYTES) throw new Error(`${file.name}: audio troppo grande. Massimo 250 MB.`);",
    'detect audio and extension fallback'
  ],
  [
    "            storagePath: uploaded.storagePath,\n            contentType: uploaded.contentType\n          });",
    "            storagePath: uploaded.storagePath,\n            contentType: uploaded.contentType,\n            size: uploaded.size\n          });",
    'image size'
  ],
  [
    "          continue;\n        }\n\n        const uploadedVideo = await uploadFirebaseVideoAiAsset(file, { fileName: file.name, kind: 'video' });",
    "          continue;\n        }\n\n        if (isAudio) {\n          const uploadedAudio = await uploadFirebaseVideoAiAsset(file, { fileName: file.name, kind: 'audio' });\n          additions.push({\n            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,\n            sourceKind: 'audio',\n            sourceName: file.name,\n            previewUrl: uploadedAudio.downloadUrl,\n            storagePath: uploadedAudio.storagePath,\n            contentType: uploadedAudio.contentType,\n            size: uploadedAudio.size\n          });\n          continue;\n        }\n\n        const uploadedVideo = await uploadFirebaseVideoAiAsset(file, { fileName: file.name, kind: 'video' });",
    'audio upload branch'
  ],
  [
    "          contentType: uploadedFrame.contentType,\n          originalStoragePath: uploadedVideo.storagePath",
    "          contentType: uploadedFrame.contentType,\n          size: uploadedVideo.size,\n          originalStoragePath: uploadedVideo.storagePath",
    'video size'
  ],
  [
    "    setStage(mediaReferences.length ? 'SONARA Video AI: preparo i riferimenti visuali' : 'SONARA Video AI: avvio generazione');",
    "    setStage(mediaReferences.length ? 'SONARA Video AI: preparo i media caricati' : 'SONARA Video AI: avvio generazione');",
    'generation stage copy'
  ],
  [
    "            sourceName: item.sourceName,\n            ...(item.originalStoragePath ? { originalStoragePath: item.originalStoragePath } : {})",
    "            sourceName: item.sourceName,\n            size: item.size,\n            ...(item.originalStoragePath ? { originalStoragePath: item.originalStoragePath } : {})",
    'send size to server'
  ],
  [
    "Text · Photo · Video to AI Video · Native AI Audio · 16:9 / 9:16",
    "Text · Photo · Video · Audio to AI Video · Native AI Audio · 16:9 / 9:16",
    'header audio copy'
  ],
  [
    "<div className=\"mb-5\"><div className=\"text-xs font-black uppercase tracking-[0.18em] text-violet-300\">AI Director</div><h2 className=\"mt-2 text-2xl font-black tracking-tight text-white\">Crea da testo, foto e video</h2><p className=\"mt-2 max-w-2xl text-xs leading-6 text-slate-500\">Carica fino a 3 riferimenti visuali. SONARA usa le foto direttamente; dai video estrae automaticamente un fotogramma guida e mantiene il file originale associato al progetto.</p></div>",
    "<div className=\"mb-5\"><div className=\"text-xs font-black uppercase tracking-[0.18em] text-violet-300\">AI Director</div><h2 className=\"mt-2 text-2xl font-black tracking-tight text-white\">Crea da testo, foto, video e audio</h2><p className=\"mt-2 max-w-2xl text-xs leading-6 text-slate-500\">Carica fino a 6 file. SONARA mostra subito ogni upload completato; usa foto e fotogrammi video come riferimenti visivi e conserva anche gli audio nel progetto Video AI.</p></div>",
    'main intro copy'
  ],
  [
    "<div><div className=\"flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-200\"><ImagePlus className=\"h-4 w-4\" />Media di riferimento</div><p className=\"mt-1 text-[9px] leading-5 text-slate-500\">JPG, PNG, WEBP e video comuni. Il primo elemento è il riferimento principale.</p></div>",
    "<div><div className=\"flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-200\"><ImagePlus className=\"h-4 w-4\" />Media di riferimento</div><p className=\"mt-1 text-[9px] leading-5 text-slate-500\">Foto, video e tutti i principali formati audio. Ogni file completato viene marcato chiaramente come CARICATO.</p></div>",
    'media help copy'
  ],
  [
    "{uploadingMedia ? 'CARICAMENTO...' : 'CARICA FOTO / VIDEO'}\n                <input type=\"file\" multiple accept=\"image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime\"",
    "{uploadingMedia ? 'CARICAMENTO...' : 'CARICA FOTO / VIDEO / AUDIO'}\n                <input type=\"file\" multiple accept=\"image/jpeg,image/png,image/webp,video/*,audio/*,.mp3,.wav,.wave,.flac,.aac,.m4a,.mp4a,.ogg,.oga,.opus,.aiff,.aif,.alac,.wma,.amr,.ape,.mka,.caf,.weba,.3ga,.mid,.midi\"",
    'file picker audio formats'
  ],
  [
    "<div className=\"relative aspect-video bg-black\">{item.sourceKind === 'video' ? <video src={item.previewUrl} muted playsInline preload=\"metadata\" className=\"h-full w-full object-cover\" /> : <img src={item.previewUrl} alt={item.sourceName} className=\"h-full w-full object-cover\" />}<div className=\"absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[8px] font-black text-white\">{index === 0 ? 'PRINCIPALE' : `RIF. ${index + 1}`}</div><div className=\"absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white\">{item.sourceKind === 'video' ? <Video className=\"h-3.5 w-3.5\" /> : <ImagePlus className=\"h-3.5 w-3.5\" />}</div></div>",
    "<div className=\"relative aspect-video bg-black\">{item.sourceKind === 'audio' ? <div className=\"flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-cyan-950/50 to-violet-950/40 p-4\"><Music2 className=\"h-9 w-9 text-cyan-300\" /><audio src={item.previewUrl} controls preload=\"metadata\" className=\"w-full max-w-[260px]\" /></div> : item.sourceKind === 'video' ? <video src={item.previewUrl} controls muted playsInline preload=\"metadata\" className=\"h-full w-full object-cover\" /> : <img src={item.previewUrl} alt={item.sourceName} className=\"h-full w-full object-cover\" />}<div className=\"absolute left-2 top-2 flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-1 text-[8px] font-black text-white\"><CheckCircle2 className=\"h-3 w-3\" />CARICATO</div><div className=\"absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white\">{item.sourceKind === 'audio' ? <Music2 className=\"h-3.5 w-3.5\" /> : item.sourceKind === 'video' ? <Video className=\"h-3.5 w-3.5\" /> : <ImagePlus className=\"h-3.5 w-3.5\" />}</div></div>",
    'audio preview and loaded badge'
  ],
  [
    "<div className=\"flex items-center gap-1 p-2\"><div className=\"min-w-0 flex-1 truncate text-[9px] font-bold text-slate-300\">{item.sourceName}</div>",
    "<div className=\"flex items-center gap-1 p-2\"><div className=\"min-w-0 flex-1\"><div className=\"truncate text-[9px] font-bold text-slate-200\">{item.sourceName}</div><div className=\"mt-0.5 flex items-center gap-2 text-[8px] text-slate-500\"><span>{item.sourceKind.toUpperCase()}</span><span>·</span><span>{formatBytes(item.size)}</span><span>·</span><span className=\"font-black text-emerald-400\">CARICATO</span></div></div>",
    'loaded metadata row'
  ],
  [
    "Puoi anche generare solo dal prompt. Se carichi foto o video, SONARA li usa come sorgente visuale del risultato.",
    "Puoi anche generare solo dal prompt. Foto e video guidano l'immagine; gli audio vengono caricati, mostrati con player e conservati nel progetto Video AI.",
    'empty copy'
  ],
  [
    "placeholder=\"Descrivi come vuoi animare o trasformare le foto/video caricati. Puoi anche lasciare vuoto se vuoi che SONARA costruisca automaticamente la regia dai riferimenti.\"",
    "placeholder=\"Descrivi come vuoi animare o trasformare foto, video e materiale audio caricato. Puoi anche lasciare vuoto se vuoi che SONARA costruisca automaticamente la regia dai riferimenti.\"",
    'prompt placeholder'
  ]
]);

patchFile('api/video/generate.ts', [
  [
    "  sourceKind: 'image' | 'video';\n  sourceName?: string;\n  originalStoragePath?: string;",
    "  sourceKind: 'image' | 'video' | 'audio';\n  sourceName?: string;\n  size?: number;\n  originalStoragePath?: string;",
    'server reference audio type'
  ],
  [
    "      const sourceKind = raw?.sourceKind === 'video' ? 'video' : 'image';\n      const sourceName = String(raw?.sourceName || '').trim().slice(0, 160);\n      const originalStoragePath = String(raw?.originalStoragePath || '').trim();\n      if (!storagePath.startsWith(prefix) || !contentType.startsWith('image/')) return [];\n      if (originalStoragePath && !originalStoragePath.startsWith(prefix)) return [];\n      return [{ storagePath, contentType, sourceKind, ...(sourceName ? { sourceName } : {}), ...(originalStoragePath ? { originalStoragePath } : {}) } as VideoReference];\n    })\n    .slice(0, 3);",
    "      const sourceKind = raw?.sourceKind === 'audio' ? 'audio' : raw?.sourceKind === 'video' ? 'video' : 'image';\n      const sourceName = String(raw?.sourceName || '').trim().slice(0, 160);\n      const size = Math.max(0, Number(raw?.size || 0));\n      const originalStoragePath = String(raw?.originalStoragePath || '').trim();\n      const acceptedMedia = contentType.startsWith('image/') || contentType.startsWith('audio/');\n      if (!storagePath.startsWith(prefix) || !acceptedMedia) return [];\n      if (originalStoragePath && !originalStoragePath.startsWith(prefix)) return [];\n      return [{ storagePath, contentType, sourceKind, ...(sourceName ? { sourceName } : {}), ...(size ? { size } : {}), ...(originalStoragePath ? { originalStoragePath } : {}) } as VideoReference];\n    })\n    .slice(0, 6);",
    'server accepts audio attachments'
  ],
  [
    "stage: references.length ? `SONARA Video AI: job accettato con ${references.length} riferimenti` : 'SONARA Video AI: job accettato',",
    "stage: references.length ? `SONARA Video AI: job accettato con ${references.length} media caricati` : 'SONARA Video AI: job accettato',",
    'job stage media copy'
  ]
]);

patchFile('api/video/job/[id].ts', [
  [
    "  sourceKind?: 'image' | 'video';\n  sourceName?: string;",
    "  sourceKind?: 'image' | 'video' | 'audio';\n  sourceName?: string;\n  size?: number;",
    'job media audio type'
  ],
  [
    "  return (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])\n    .filter(item => item && typeof item.storagePath === 'string' && item.storagePath.trim())\n    .slice(0, 3)",
    "  return (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])\n    .filter(item => item && typeof item.storagePath === 'string' && item.storagePath.trim() && String(item.contentType || 'image/jpeg').toLowerCase().startsWith('image/'))\n    .slice(0, 3)",
    'only visual refs go to Veo'
  ]
]);

console.log('SONARA Video AI media v2 patch applied: visible uploaded state + audio formats.');
