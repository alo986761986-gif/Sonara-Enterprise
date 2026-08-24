import React, { useEffect, useRef, useState } from 'react';
import Globe from 'globe.gl';
import { Globe2, Music2, Radio, Users } from 'lucide-react';
import { CITY_HUBS, type CityHub } from './MarkerManager';

interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

const CONNECTIONS: Array<[string, string, string]> = [
  ['city-london', 'city-berlin', '#22d3ee'],
  ['city-rome', 'city-lagos', '#a855f7'],
  ['city-tokyo', 'city-la', '#f472b6'],
  ['city-seoul', 'city-tokyo', '#38bdf8'],
  ['city-paris', 'city-ny', '#8b5cf6'],
  ['city-saopaulo', 'city-barcelona', '#ec4899'],
  ['city-lagos', 'city-london', '#06b6d4']
];

const ARCS: ArcData[] = CONNECTIONS.flatMap(([fromId, toId, color]) => {
  const from = CITY_HUBS.find(city => city.id === fromId);
  const to = CITY_HUBS.find(city => city.id === toId);
  return from && to ? [{
    startLat: from.latitude,
    startLng: from.longitude,
    endLat: to.latitude,
    endLng: to.longitude,
    color
  }] : [];
});

const COLORS = ['#22d3ee', '#8b5cf6', '#f472b6', '#38bdf8'];

export default function WorldDiscoveryGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<CityHub>(CITY_HUBS.find(city => city.id === 'city-rome') || CITY_HUBS[0]);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let globe: any;
    let resizeObserver: ResizeObserver | null = null;
    try {
      globe = new Globe(container)
        .width(container.clientWidth)
        .height(container.clientHeight)
        .backgroundColor('#02050e')
        .globeImageUrl('/assets/earth/earth-blue-marble.png')
        .showAtmosphere(true)
        .atmosphereColor('#7c3aed')
        .atmosphereAltitude(0.2)
        .pointsData(CITY_HUBS)
        .pointLat((city: CityHub) => city.latitude)
        .pointLng((city: CityHub) => city.longitude)
        .pointColor((city: CityHub) => city.id === 'city-rome' ? '#f472b6' : '#22d3ee')
        .pointAltitude((city: CityHub) => 0.04 + Math.min(city.creatorCount / 20_000, 0.11))
        .pointRadius((city: CityHub) => 0.22 + Math.min(city.creatorCount / 8_000, 0.26))
        .pointLabel((city: CityHub) => `${city.flag} ${city.name} · ${city.creatorCount.toLocaleString('it-IT')} creator`)
        .onPointClick((city: CityHub) => {
          setSelected(city);
          globe.pointOfView({ lat: city.latitude, lng: city.longitude, altitude: 1.25 }, 1_200);
        })
        .arcsData(ARCS)
        .arcStartLat((arc: ArcData) => arc.startLat)
        .arcStartLng((arc: ArcData) => arc.startLng)
        .arcEndLat((arc: ArcData) => arc.endLat)
        .arcEndLng((arc: ArcData) => arc.endLng)
        .arcColor((arc: ArcData) => [arc.color, '#ffffff'])
        .arcAltitude(0.22)
        .arcStroke(0.8)
        .arcDashLength(0.34)
        .arcDashGap(0.12)
        .arcDashAnimateTime(1_800)
        .ringsData(CITY_HUBS)
        .ringLat((city: CityHub) => city.latitude)
        .ringLng((city: CityHub) => city.longitude)
        .ringColor((city: CityHub) => () => COLORS[CITY_HUBS.findIndex(item => item.id === city.id) % COLORS.length])
        .ringMaxRadius(1.8)
        .ringPropagationSpeed(1.4)
        .ringRepeatPeriod(1_600)
        .labelsData(CITY_HUBS)
        .labelLat((city: CityHub) => city.latitude)
        .labelLng((city: CityHub) => city.longitude)
        .labelText((city: CityHub) => city.name)
        .labelColor(() => '#e2e8f0')
        .labelSize(0.55)
        .labelDotRadius(0.12)
        .labelAltitude(0.08);

      const controls = globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
      controls.enableDamping = true;
      globe.pointOfView({ lat: 24, lng: 8, altitude: 2.15 }, 0);

      resizeObserver = new ResizeObserver(() => {
        if (!container.clientWidth || !container.clientHeight) return;
        globe.width(container.clientWidth).height(container.clientHeight);
      });
      resizeObserver.observe(container);
    } catch (error) {
      console.warn('[DISCOVERY] WebGL globe initialization failed.');
      setWebglError(true);
    }

    return () => {
      resizeObserver?.disconnect();
      try { globe?.controls?.().dispose?.(); } catch {}
      try { globe?._destructor?.(); } catch {}
      container.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-[540px] overflow-hidden bg-[#02050e] sm:h-[620px]">
      <div ref={containerRef} className="absolute inset-0" aria-label="Mappamondo musicale interattivo Sonara" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(2,5,14,0.5)_100%)]" />

      <div className="pointer-events-none absolute left-4 top-4 max-w-[260px] rounded-2xl border border-white/10 bg-slate-950/75 p-4 backdrop-blur-xl sm:left-6 sm:top-6">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan-300"><Globe2 className="h-4 w-4" />Worldwide Discovery</div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">Trascina per ruotare, usa lo zoom e seleziona un hub per esplorare la rete musicale globale.</p>
      </div>

      {!webglError && selected && (
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-purple-500/25 bg-slate-950/85 p-4 backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[330px]">
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-lg font-black text-white">{selected.flag} {selected.name}</div><div className="text-[10px] uppercase tracking-wider text-purple-300">{selected.country} · Music hub</div></div>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-300">LIVE</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/[0.045] p-2.5"><Users className="mb-1 h-3.5 w-3.5 text-cyan-400" /><b className="block text-xs text-white">{selected.creatorCount.toLocaleString('it-IT')}</b><span className="text-[9px] text-slate-500">Creator</span></div>
            <div className="rounded-xl bg-white/[0.045] p-2.5"><Music2 className="mb-1 h-3.5 w-3.5 text-fuchsia-400" /><b className="block text-xs text-white">{selected.studiosCount}</b><span className="text-[9px] text-slate-500">Studio</span></div>
            <div className="rounded-xl bg-white/[0.045] p-2.5"><Radio className="mb-1 h-3.5 w-3.5 text-purple-400" /><b className="block text-xs text-white">{selected.liveCollabsCount}</b><span className="text-[9px] text-slate-500">Live collab</span></div>
          </div>
          <div className="mt-3 text-[10px] leading-5 text-slate-400"><b className="text-slate-200">Top generi:</b> {selected.topGenres.join(' · ')}<br /><b className="text-slate-200">Trending:</b> {selected.trendingSong}</div>
        </div>
      )}

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center"><div><Globe2 className="mx-auto h-12 w-12 text-purple-400" /><p className="mt-4 text-sm font-bold text-white">Il mappamondo 3D richiede WebGL</p><p className="mt-2 text-xs text-slate-500">Attiva l'accelerazione grafica del browser e ricarica la pagina.</p></div></div>
      )}
    </div>
  );
}
