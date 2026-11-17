import { useEffect } from 'react';
import { Download, Plus, Shuffle, SlidersHorizontal, Trash2 } from 'lucide-react';

export type ProSectionName = 'intro'|'verse'|'chorus'|'bridge'|'drop'|'outro';
export type ProSection = {name:ProSectionName;bars:4|8|16;voice:'auto'|'a'|'b'|'none';energy:number};
export type DirectorSettings = {
  vocalPolicy:'dialogue'|'a'|'b'|'instrumental';
  masterProfile:'studio'|'club'|'streaming';
  variation:number;
  vocalGainA:number;
  vocalGainB:number;
  instrumentGainB:number;
  sections:ProSection[];
};
export const defaultDirector:DirectorSettings = {
  vocalPolicy:'dialogue',masterProfile:'studio',variation:0,
  vocalGainA:75,vocalGainB:75,instrumentGainB:75,
  sections:[
    {name:'intro',bars:8,voice:'none',energy:35},
    {name:'verse',bars:8,voice:'a',energy:65},
    {name:'chorus',bars:16,voice:'b',energy:90},
    {name:'drop',bars:16,voice:'none',energy:100},
    {name:'bridge',bars:8,voice:'a',energy:45},
    {name:'chorus',bars:16,voice:'b',energy:90},
    {name:'outro',bars:8,voice:'none',energy:30},
  ]
};
const names:ProSectionName[]=['intro','verse','chorus','bridge','drop','outro'];
const label:Record<ProSectionName,string>={intro:'Intro',verse:'Strofa',chorus:'Ritornello',bridge:'Bridge',drop:'Drop',outro:'Finale'};
const voiceOptions=[
  {value:'auto',label:'Auto (A/B)'},{value:'a',label:'Voce A'},
  {value:'b',label:'Voce B'},{value:'none',label:'Nessuna voce'}
] as const;
const base='rounded-lg border border-slate-700 bg-[#0b1020] px-3 py-2 text-sm text-white';

export function readSavedDirector():DirectorSettings{
  try{
    const raw=localStorage.getItem('sonara.mashup.musicDirector.v2');
    if(!raw)return defaultDirector;
    const value=JSON.parse(raw) as DirectorSettings;
    if(!value||!Array.isArray(value.sections)||value.sections.length>32||
      !names.every(n=>typeof n==='string')||
      value.sections.some(s=>!names.includes(s.name)||![4,8,16].includes(s.bars)||
        !['auto','a','b','none'].includes(s.voice)||!Number.isFinite(s.energy)||s.energy<0||s.energy>100))
      return defaultDirector;
    if(!['dialogue','a','b','instrumental'].includes(value.vocalPolicy)||
      !['studio','club','streaming'].includes(value.masterProfile)||
      !Number.isInteger(value.variation)||value.variation<0||value.variation>99)return defaultDirector;
    for(const p of ['vocalGainA','vocalGainB','instrumentGainB'] as const)
      if(!Number.isFinite(value[p])||value[p]<0||value[p]>100)return defaultDirector;
    return value;
  }catch{return defaultDirector;}
}
export default function MusicDirectorPanel({value,onChange,enabled,bpm,locked=false}:{
  value:DirectorSettings;onChange:(v:DirectorSettings)=>void;enabled:boolean;bpm:number;locked?:boolean;
}){
  useEffect(()=>{
    try{localStorage.setItem('sonara.mashup.musicDirector.v2',JSON.stringify(value));}catch{}
  },[value]);
  const set=<K extends keyof DirectorSettings>(field:K,next:DirectorSettings[K])=>
    onChange({...value,[field]:next});
  const replace=(index:number,next:ProSection)=>{
    set('sections',value.sections.map((s,i)=>i===index?next:s));
  };
  const totalBars=value.sections.reduce((sum,s)=>sum+s.bars,0);
  const totalDuration=totalBars*240/Math.max(60,bpm);
  const exportProject=()=>{
    const project={project:'SONARA Mashup AI Pro',format:'music-director-v2-project',
      version:2,createdAt:new Date().toISOString(),masterBpm:bpm,
      estimateDurationSeconds:Math.round(totalDuration),
      options:value,
      notice:'Arrangement metadata only; no copyrighted source audio or audio stems are embedded.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='SONARA-Mashup-Music-Director.project.json';
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  return <section className="rounded-2xl border border-violet-500/30 bg-[#141527] p-5" aria-label="Music Director V2 professional arranger">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold"><SlidersHorizontal size={18} className="text-violet-400"/> Music Director V2 · Studio Pro</h2>
        <p className="text-xs text-slate-400">Modifica sezioni, voce principale, energia e mastering prima del rendering. Ogni variazione usa stem reali Demucs.</p>
      </div>
      <span className={'rounded-full px-3 py-1 text-xs '+(enabled?'bg-emerald-950 text-emerald-300':'bg-amber-950 text-amber-200')}>
        {enabled?'Arrangiatore V2 pronto':'Worker V2 da aggiornare su MoLab'}
      </span>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">Politica voci
        <select disabled={locked} className={'mt-2 w-full '+base} value={value.vocalPolicy}
          onChange={e=>set('vocalPolicy',e.target.value as DirectorSettings['vocalPolicy'])}>
          <option value="dialogue">Dialogo A + B</option>
          <option value="a">Solo voce A</option><option value="b">Solo voce B</option>
          <option value="instrumental">Strumentale</option>
        </select>
      </label>
      <label className="text-xs text-slate-400">Master
        <select disabled={locked} className={'mt-2 w-full '+base} value={value.masterProfile}
          onChange={e=>set('masterProfile',e.target.value as DirectorSettings['masterProfile'])}>
          <option value="studio">Studio · -16 LUFS indicativi</option>
          <option value="streaming">Streaming · -14 LUFS indicativi</option>
          <option value="club">Club · -11 LUFS indicativi</option>
        </select>
      </label>
      <div className="flex flex-col justify-end gap-2">
        <button type="button" disabled={locked} className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/50 p-2 text-xs text-violet-200 disabled:opacity-50"
          onClick={()=>set('variation',(value.variation+1)%100)}><Shuffle size={15}/> Nuova direzione · #{value.variation}</button>
      </div>
      {([
        ['vocalGainA','Livello voce A'],
        ['vocalGainB','Livello voce B'],
        ['instrumentGainB','Strumenti B']
      ] as const).map(([key,name])=><label key={key} className="text-xs text-slate-400">
        <span className="flex justify-between"><span>{name}</span><b className="text-slate-100">{value[key]}%</b></span>
        <input disabled={locked} type="range" min="0" max="100" value={value[key]} className="mt-3 w-full accent-violet-500"
          onChange={e=>set(key,Number(e.target.value))}/>
      </label>)}
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Timeline musicale modificabile</h3>
        <p className="mt-1 text-xs text-slate-400">{totalBars} battute · circa {Math.round(totalDuration)} secondi al BPM {bpm || 124}. Il motore adatta il piano alla durata richiesta.</p></div>
      <div className="flex gap-2">
        <button disabled={locked||value.sections.length>=32} onClick={()=>set('sections',[...value.sections,{name:'verse',bars:8,voice:'auto',energy:70}])}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs disabled:opacity-40"><Plus size={15}/> Sezione</button>
        <button onClick={exportProject} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs"><Download size={15}/> Salva progetto</button>
      </div>
    </div>
    <div className="mt-3 flex min-h-10 gap-1 overflow-hidden rounded-lg border border-slate-800 p-1">
      {value.sections.map((section,i)=><div key={i} title={label[section.name]+' · '+section.bars+' battute'}
        className={'flex min-w-0 items-center justify-center rounded-md px-1 text-[10px] font-bold '+
          (section.voice==='a'?'bg-violet-600/50':section.voice==='b'?'bg-cyan-600/45':'bg-slate-700')}
        style={{flex:section.bars}}><span className="truncate">{label[section.name]}</span></div>)}
    </div>
    <div className="mt-3 grid gap-2">
      {value.sections.map((section,i)=><div key={i} className="grid grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)_78px_32px] items-center gap-2 rounded-xl border border-slate-800 bg-[#0c1020] p-2">
        <select aria-label={'Sezione '+(i+1)} disabled={locked} className={base+' min-w-0 px-1'}
          value={section.name} onChange={e=>replace(i,{...section,name:e.target.value as ProSectionName})}>
          {names.map(n=><option value={n} key={n}>{label[n]}</option>)}
        </select>
        <select aria-label="Battute" disabled={locked} className={base+' px-1'} value={section.bars}
          onChange={e=>replace(i,{...section,bars:Number(e.target.value) as 4|8|16})}>
          {[4,8,16].map(n=><option key={n} value={n}>{n} batt.</option>)}
        </select>
        <select aria-label="Voce" disabled={locked} className={base+' min-w-0 px-1'} value={section.voice}
          onChange={e=>replace(i,{...section,voice:e.target.value as ProSection['voice']})}>
          {voiceOptions.map(v=><option value={v.value} key={v.value}>{v.label}</option>)}
        </select>
        <label className="text-center text-[10px] text-slate-400">Energia {section.energy}%
          <input disabled={locked} aria-label="Energia" type="range" className="w-full accent-violet-500"
            min="0" max="100" value={section.energy}
            onChange={e=>replace(i,{...section,energy:Number(e.target.value)})}/>
        </label>
        <button aria-label="Elimina sezione" disabled={locked||value.sections.length<=1}
          className="rounded-md p-2 text-slate-400 hover:text-rose-300 disabled:opacity-40"
          onClick={()=>set('sections',value.sections.filter((_,j)=>j!==i))}><Trash2 size={15}/></button>
      </div>)}
    </div>
    <p className="mt-4 text-xs text-slate-500">Il riconoscimento di strofe e accordi non è garantito: questa timeline è una direzione musicale modificabile. Il controllo di qualità non sostituisce l'ascolto professionale. Il file progetto JSON non è un progetto DAW nativo.</p>
  </section>;
}
