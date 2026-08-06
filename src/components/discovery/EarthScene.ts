// EarthScene.ts - Core 3D Earth Engine Renderer (CesiumJS & Globe.gl / Three.js WebGL Engine)
import * as THREE from 'three';
import Globe from 'globe.gl';
import { EARTH_TEXTURES } from './EarthTextures';
import { EarthLightingController } from './EarthLighting';
import { CameraController, SPACE_START_CAMERA, CONTINENT_FLYTO_TARGET } from './CameraController';
import { GLOBAL_MARKERS, EarthMarker, GENRE_COLORS, CREATOR_TYPE_ICONS, CITY_HUBS, CityHub } from './MarkerManager';
import { INITIAL_GLOBAL_ARCS, EarthArc } from './ArcManager';
import { CITY_HEATMAP_POINTS, HeatmapPoint } from './HeatmapManager';
import { GlobeRingData } from './HeatLayerManager';

export interface EarthSceneOptions {
  container: HTMLElement;
  onMarkerClick?: (marker: EarthMarker) => void;
  onMarkerDoubleClick?: (marker: EarthMarker) => void;
  onCityClick?: (city: CityHub) => void;
  onMarkerHover?: (marker: EarthMarker | null) => void;
}

export class EarthScene {
  private container: HTMLElement;
  private globeInstance: any = null;
  private cameraController: CameraController;
  private lightingController: EarthLightingController;
  private animFrameId: number | null = null;
  private onMarkerClick?: (marker: EarthMarker) => void;
  private onMarkerDoubleClick?: (marker: EarthMarker) => void;
  private onCityClick?: (city: CityHub) => void;
  private onMarkerHover?: (marker: EarthMarker | null) => void;

  private currentMarkers: EarthMarker[] = [...GLOBAL_MARKERS];
  private currentCities: CityHub[] = [...CITY_HUBS];
  private currentViewMode: 'globe' | 'network' | 'hybrid' = 'globe';

  public setNetworkViewMode(mode: 'globe' | 'network' | 'hybrid'): void {
    this.currentViewMode = mode;
    if (!this.globeInstance) return;

    const globeObj = this.globeInstance.scene();
    const cloudMesh = globeObj.getObjectByName('cloudMesh');

    if (mode === 'network') {
      // Hide surface texture, show dark neural space sphere
      this.globeInstance
        .globeImageUrl(null)
        .bumpImageUrl(null)
        .showAtmosphere(true)
        .atmosphereColor('#8b5cf6')
        .atmosphereAltitude(0.3)
        .backgroundColor('#02050e');

      if (cloudMesh) cloudMesh.visible = false;
    } else if (mode === 'hybrid') {
      // Night map earth with floating arcs above
      this.globeInstance
        .globeImageUrl(EARTH_TEXTURES.nightMap)
        .bumpImageUrl(EARTH_TEXTURES.bumpMap)
        .showAtmosphere(true)
        .atmosphereColor('#38bdf8')
        .atmosphereAltitude(0.25)
        .backgroundColor('#02050e');

      if (cloudMesh) {
        cloudMesh.visible = true;
        cloudMesh.material.opacity = 0.2;
      }
    } else {
      // Standard full Earth view
      this.globeInstance
        .globeImageUrl(EARTH_TEXTURES.dayMap)
        .bumpImageUrl(EARTH_TEXTURES.bumpMap)
        .showAtmosphere(true)
        .atmosphereColor('#3a88ff')
        .atmosphereAltitude(0.2)
        .backgroundColor('#02050e');

      if (cloudMesh) {
        cloudMesh.visible = true;
        cloudMesh.material.opacity = 0.38;
      }
    }
  }

  constructor(options: EarthSceneOptions) {
    this.container = options.container;
    this.onMarkerClick = options.onMarkerClick;
    this.onMarkerDoubleClick = options.onMarkerDoubleClick;
    this.onCityClick = options.onCityClick;
    this.onMarkerHover = options.onMarkerHover;
    this.cameraController = new CameraController(SPACE_START_CAMERA);
    this.lightingController = new EarthLightingController();

    this.initEngine();
  }

  private initEngine(): void {
    try {
      this.initGlobeGL();
    } catch (err) {
      console.warn('Falling back to direct Three.js 3D WebGL Earth renderer:', err);
      this.initThreeJSEarth();
    }

    // Start Space-to-Continent flyTo sequence on initial start
    setTimeout(() => {
      this.flyTo(CONTINENT_FLYTO_TARGET.lat, CONTINENT_FLYTO_TARGET.lng, CONTINENT_FLYTO_TARGET.altitude, 3000);
    }, 800);
  }

  private initGlobeGL(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Instantiate Globe.gl 3D WebGL Earth
    this.globeInstance = Globe()(this.container)
      .width(width)
      .height(height)
      .globeImageUrl(EARTH_TEXTURES.dayMap)
      .bumpImageUrl(EARTH_TEXTURES.bumpMap)
      .showAtmosphere(true)
      .atmosphereColor('#3a88ff')
      .atmosphereAltitude(0.2)
      .backgroundColor('#02050e');

    // Enable Night Lights & Cloud Layer on Globe
    const globeObj = this.globeInstance.scene();

    // Custom Cloud Layer Mesh
    const cloudGeo = new THREE.SphereGeometry(this.globeInstance.getGlobeRadius() * 1.012, 75, 75);
    const cloudTex = new THREE.TextureLoader().load(EARTH_TEXTURES.cloudsMap);
    const cloudMat = new THREE.MeshPhongMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.name = 'cloudMesh';
    globeObj.add(cloudMesh);

    // Directional Sunlight
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(-100, 50, 100);
    globeObj.add(sunLight);

    // Configure 3D Arcs (Connection Streams)
    this.globeInstance
      .arcsData(INITIAL_GLOBAL_ARCS)
      .arcStartLat((d: EarthArc) => d.startLat)
      .arcStartLng((d: EarthArc) => d.startLng)
      .arcEndLat((d: EarthArc) => d.endLat)
      .arcEndLng((d: EarthArc) => d.endLng)
      .arcColor((d: EarthArc) => d.color)
      .arcAltitude((d: EarthArc) => d.altitude)
      .arcStroke((d: EarthArc) => d.stroke)
      .arcDashLength((d: EarthArc) => d.dashLength)
      .arcDashGap((d: EarthArc) => d.dashGap)
      .arcDashAnimateTime((d: EarthArc) => d.dashAnimateTime);

    // Configure Heatmap Rings for City Hubs
    this.globeInstance
      .ringsData(CITY_HEATMAP_POINTS)
      .ringLat((d: HeatmapPoint) => d.lat)
      .ringLng((d: HeatmapPoint) => d.lng)
      .ringColor((d: HeatmapPoint) => () => d.color)
      .ringMaxRadius((d: HeatmapPoint) => d.radius)
      .ringPropagationSpeed(1.8)
      .ringRepeatPeriod(1200);

    // Render HTML Markers (Creators + City Hub Clusters)
    this.renderHtmlMarkers();

    // Auto Rotation Loop
    this.globeInstance.controls().autoRotate = true;
    this.globeInstance.controls().autoRotateSpeed = 0.6;
    this.globeInstance.controls().enableZoom = true;

    // Window Resize Handler
    const handleResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.globeInstance.width(w).height(h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Render Loop (Rotates cloud mesh smoothly)
    let lastTime = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      if (cloudMesh) {
        cloudMesh.rotation.y += 0.00015 * delta;
      }

      this.animFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  public updateData(filteredMarkers: EarthMarker[], cities: CityHub[] = CITY_HUBS): void {
    this.currentMarkers = filteredMarkers;
    this.currentCities = cities;
    this.renderHtmlMarkers();
  }

  public updateMarkers(filteredMarkers: EarthMarker[], cities: CityHub[] = CITY_HUBS): void {
    this.updateData(filteredMarkers, cities);
  }

  public updateHeatRings(rings: GlobeRingData[]): void {
    if (!this.globeInstance) return;
    this.globeInstance
      .ringsData(rings)
      .ringLat((d: GlobeRingData) => d.lat)
      .ringLng((d: GlobeRingData) => d.lng)
      .ringColor((d: GlobeRingData) => () => d.color)
      .ringMaxRadius((d: GlobeRingData) => d.maxRadius)
      .ringPropagationSpeed((d: GlobeRingData) => d.propagationSpeed)
      .ringRepeatPeriod((d: GlobeRingData) => d.repeatPeriod);
  }

  public updateArcs(arcs: EarthArc[]): void {
    if (!this.globeInstance) return;
    this.globeInstance
      .arcsData(arcs)
      .arcStartLat((d: EarthArc) => d.startLat)
      .arcStartLng((d: EarthArc) => d.startLng)
      .arcEndLat((d: EarthArc) => d.endLat)
      .arcEndLng((d: EarthArc) => d.endLng)
      .arcColor((d: EarthArc) => d.color)
      .arcAltitude((d: EarthArc) => d.altitude)
      .arcStroke((d: EarthArc) => d.stroke)
      .arcDashLength((d: EarthArc) => d.dashLength)
      .arcDashGap((d: EarthArc) => d.dashGap)
      .arcDashAnimateTime((d: EarthArc) => d.dashAnimateTime);
  }

  private renderHtmlMarkers(): void {
    if (!this.globeInstance) return;

    // Combine Creators and City Clusters into unified HTML dataset
    const combinedData = [
      ...this.currentCities.map((c) => ({ ...c, _type: 'city' as const, lat: c.latitude, lng: c.longitude })),
      ...this.currentMarkers.map((m) => ({ ...m, _type: 'creator' as const, lat: m.latitude, lng: m.longitude }))
    ];

    this.globeInstance
      .htmlElementsData(combinedData)
      .htmlLat((d: any) => d.lat)
      .htmlLng((d: any) => d.lng)
      .htmlElement((d: any) => {
        const el = document.createElement('div');
        el.className = 'earth-marker-wrapper cursor-pointer group flex items-center justify-center';
        el.style.transform = 'translate(-50%, -50%)';

        if (d._type === 'city') {
          // City Hub Cluster Element
          const c = d as CityHub & { _type: 'city' };
          el.innerHTML = `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 rounded-full bg-cyan-500/30 animate-ping"></div>
              <div class="px-2.5 py-1 rounded-full bg-slate-900/90 border border-cyan-400/80 text-cyan-300 text-[10px] font-black flex items-center gap-1 shadow-lg backdrop-blur-md group-hover:scale-110 transition-transform">
                <span>${c.flag}</span>
                <span>${c.name}</span>
                <span class="bg-cyan-500/20 text-cyan-200 px-1.5 py-0.2 rounded-full text-[9px]">${c.creatorCount}</span>
              </div>
            </div>
          `;
          el.onclick = () => {
            if (this.onCityClick) this.onCityClick(c);
            this.flyTo(c.latitude, c.longitude, 0.85, 2000);
          };
          return el;
        }

        // Creator Marker Element
        const m = d as EarthMarker & { _type: 'creator' };
        const genreColor = GENRE_COLORS[m.genre] || '#8b5cf6';
        const typeIcon = CREATOR_TYPE_ICONS[m.creatorType] || '🎙️';

        // Size calculation based on followers
        const baseSize = Math.max(28, Math.min(46, Math.floor(28 + (m.followers / 50000))));

        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            ${
              m.online
                ? `<div class="absolute inset-0 rounded-full animate-ping opacity-60" style="background-color: ${genreColor}"></div>`
                : ''
            }
            ${
              m.verified
                ? `<div class="absolute -inset-1 rounded-full border-2 border-dashed border-amber-400 animate-spin" style="animation-duration: 8s"></div>`
                : ''
            }
            <div 
              class="rounded-full border-2 border-white flex items-center justify-center shadow-2xl transition-transform group-hover:scale-125 relative overflow-hidden"
              style="width: ${baseSize}px; height: ${baseSize}px; background-color: ${genreColor}"
            >
              <img src="${m.avatar}" alt="${m.displayName}" class="w-full h-full object-cover rounded-full" />
              <span class="absolute bottom-0 right-0 bg-black/80 rounded-full p-0.5 text-[10px]">${typeIcon}</span>
            </div>

            <!-- Hover Tooltip Card -->
            <div class="absolute top-full mt-2 px-3 py-2 rounded-xl bg-slate-900/95 border border-slate-700/80 backdrop-blur-xl text-white shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 flex flex-col gap-1 w-48">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold truncate">${m.displayName}</span>
                <span class="text-[10px]">${m.flag}</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center justify-between">
                <span>@${m.username}</span>
                <span class="text-amber-400 font-semibold">${(m.followers / 1000).toFixed(1)}k followers</span>
              </div>
              <div class="text-[9px] px-1.5 py-0.5 rounded text-center font-bold" style="background-color: ${genreColor}33; color: ${genreColor}">
                ${m.genre} • ${m.liveStatus}
              </div>
            </div>
          </div>
        `;

        let clickTimeout: any = null;

        el.onclick = (e) => {
          e.stopPropagation();
          if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
            // Double Click
            if (this.onMarkerDoubleClick) this.onMarkerDoubleClick(m);
          } else {
            clickTimeout = setTimeout(() => {
              clickTimeout = null;
              // Single Click
              if (this.onMarkerClick) this.onMarkerClick(m);
              this.flyTo(m.latitude, m.longitude, 0.95, 2000);
            }, 250);
          }
        };

        el.onmouseenter = () => {
          if (this.onMarkerHover) this.onMarkerHover(m);
        };
        el.onmouseleave = () => {
          if (this.onMarkerHover) this.onMarkerHover(null);
        };

        return el;
      });
  }

  private initThreeJSEarth(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02050e');

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 300);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(renderer.domElement);

    // Earth Sphere
    const geo = new THREE.SphereGeometry(100, 64, 64);
    const tex = new THREE.TextureLoader().load(EARTH_TEXTURES.dayMap);
    const mat = new THREE.MeshPhongMaterial({ map: tex });
    const earthMesh = new THREE.Mesh(geo, mat);
    scene.add(earthMesh);

    // Lights
    const ambLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(200, 100, 200);
    scene.add(dirLight);

    const renderLoop = () => {
      earthMesh.rotation.y += 0.002;
      renderer.render(scene, camera);
      this.animFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }

  public flyTo(lat: number, lng: number, altitude: number = 1.25, durationMs: number = 2500): void {
    if (this.globeInstance) {
      this.globeInstance.pointOfView({ lat, lng, altitude }, durationMs);
    }
  }

  public setAutoRotation(enable: boolean): void {
    if (this.globeInstance) {
      this.globeInstance.controls().autoRotate = enable;
    }
  }

  public destroy(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  public dispose(): void {
    this.destroy();
  }
}

