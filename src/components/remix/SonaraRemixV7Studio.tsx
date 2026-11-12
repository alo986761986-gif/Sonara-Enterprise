import type { V7Intent, V7Direction } from './sonaraRemixV7Director';
import { v7Directions } from './sonaraRemixV7Director';
import { AudioWaveform, Check, Music2, ShieldCheck } from 'lucide-react';

const CONTROLS=[
  ['vocalFlow','Fusione voci A+B','Frasi originali, pause e dialogo senza ritornelli incollati'],
  ['houseGroove','House Groove A','Una sola cassa, swing naturale e piccole variazioni'],
  ['harmony','Harmonic Match','Basso e accordi coerenti, senza forzare la tonalità delle voci'],
  ['arrangement','Arrangiamento','Introduzione, sviluppo, dinamica e finale coerente'],
] as const;

export default function SonaraRemixV7Studio({
  enabled,onEnabledChange,intent,onIntentChange,direction,onDirectionChange,
}:{
  enabled:boolean;onEnabledChange:(value:boolean)=>void;
  intent:V7Intent;onIntentChange:(value:V7Intent)=>void;
  direction:V7Direction['id'];onDirectionChange:(value:V7Direction['id'])=>void;
}){
  const directions=v7Directions(intent);
  return <section className="sonara-v7-studio" aria-label="SONARA V7 Studio Director" data-testid="sonara-v7-director">
    <header className="sonara-v7-heading">
      <span className="sonara-v7-heading-icon"><AudioWaveform size={20}/></span>
      <div><span className="sonara-v7-kicker">NUOVO · STUDIO DIRECTOR</span>
        <h3>SONARA V7 · Deep Fusion</h3>
        <p>Sette strumenti creativi, sempre con verifica tecnica e master privato.</p>
      </div>
      <label className="sonara-v7-toggle">
        <input aria-label="Attiva direzione creativa V7" type="checkbox" checked={enabled}
          onChange={e=>onEnabledChange(e.target.checked)}/>
        <span>{enabled?'Direzione V7 attiva':'V6 originale'}</span>
      </label>
    </header>
    <p className="sonara-v7-note"><ShieldCheck size={16}/>
      La direzione V7 guida il motore V6 già attivo: non afferma che la GPU sia stata aggiornata a un nuovo modello.
      L'audio viene elaborato solo all'avvio di un job autorizzato.
    </p>
    {enabled&&<>
      <div className="sonara-v7-sliders">
        {CONTROLS.map(([field,title,description])=><label key={field} className="sonara-v7-slider">
          <span><strong>{title}</strong><em>{intent[field]}%</em></span>
          <small>{description}</small>
          <input type="range" min={0} max={100} step={5} aria-label={title}
            value={intent[field]}
            onChange={e=>onIntentChange({...intent,[field]:Number(e.target.value)})}/>
        </label>)}
      </div>
      <div className="sonara-v7-subsection">
        <strong><Music2 size={17}/> Scegli la direzione musicale</strong>
        <small>Tre proposte compositive da confrontare prima della generazione. Non sono anteprime audio.</small>
      </div>
      <div className="sonara-v7-directions">
        {directions.map(item=><button type="button" key={item.id} className={direction===item.id?'is-selected':''}
          aria-pressed={direction===item.id} onClick={()=>onDirectionChange(item.id)}
          data-testid={'sonara-v7-direction-'+item.id}>
          <span><strong>{item.name}</strong>{direction===item.id&&<Check size={15}/>}</span>
          <small>{item.focus}</small>
        </button>)}
      </div>
      <div className="sonara-v7-pipeline">
        <span>01 · Voci intelligenti</span><span>02 · Groove A</span>
        <span>03 · Armonia</span><span>04 · Arrangiamento</span>
        <span>05 · Mastering</span><span>06 · Varianti</span><span>07 · Archivio versioni</span>
      </div>
      <small className="sonara-v7-disclaimer">Voci, armonia, realismo e arrangiamento richiedono ascolto umano.
        La selezione automatica dei candidati dipende dal numero autorizzato per la durata scelta;
        la schermata non inventa risultati o controlli GPU non disponibili.</small>
    </>}
  </section>
}
