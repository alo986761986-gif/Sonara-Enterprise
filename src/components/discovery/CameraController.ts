// CameraController.ts - Camera Orbit, Zoom, Rotate, Tilt, FlyTo with Smooth Interpolation

export interface CameraPosition {
  lat: number;
  lng: number;
  altitude: number; // 0.1 (surface) to 3.5 (deep space)
  heading: number;  // 0 to 360
  pitch: number;    // -90 (looking straight down) to 0
}

export const SPACE_START_CAMERA: CameraPosition = {
  lat: 20.0,
  lng: 0.0,
  altitude: 3.2,
  heading: 0,
  pitch: -30,
};

export const CONTINENT_FLYTO_TARGET: CameraPosition = {
  lat: 51.5074,
  lng: -0.1278,
  altitude: 1.25,
  heading: 0,
  pitch: -25,
};

export class CameraController {
  private currentPos: CameraPosition;
  private targetPos: CameraPosition | null = null;
  private isAnimating: boolean = false;
  private animProgress: number = 0;
  private animDurationMs: number = 3000;
  private autoRotateSpeed: number = 0.08;
  private isAutoRotating: boolean = true;

  constructor(initialPos: CameraPosition = SPACE_START_CAMERA) {
    this.currentPos = { ...initialPos };
  }

  public getPosition(): CameraPosition {
    return this.currentPos;
  }

  public setAutoRotation(enable: boolean, speed: number = 0.08): void {
    this.isAutoRotating = enable;
    this.autoRotateSpeed = speed;
  }

  public updateAutoRotation(deltaMs: number): void {
    if (this.isAutoRotating && !this.isAnimating) {
      this.currentPos.lng = (this.currentPos.lng + this.autoRotateSpeed * (deltaMs / 16)) % 360;
    }
  }

  public flyTo(target: Partial<CameraPosition>, durationMs: number = 2500): void {
    this.targetPos = {
      lat: target.lat ?? this.currentPos.lat,
      lng: target.lng ?? this.currentPos.lng,
      altitude: target.altitude ?? this.currentPos.altitude,
      heading: target.heading ?? this.currentPos.heading,
      pitch: target.pitch ?? this.currentPos.pitch,
    };
    this.animDurationMs = durationMs;
    this.animProgress = 0;
    this.isAnimating = true;
  }

  public stepAnimation(deltaMs: number): CameraPosition {
    if (!this.isAnimating || !this.targetPos) {
      this.updateAutoRotation(deltaMs);
      return this.currentPos;
    }

    this.animProgress += deltaMs / this.animDurationMs;
    if (this.animProgress >= 1.0) {
      this.currentPos = { ...this.targetPos };
      this.isAnimating = false;
      this.targetPos = null;
      return this.currentPos;
    }

    // Smooth cubic easing (easeInOutCubic)
    const t = this.animProgress;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.currentPos = {
      lat: this.currentPos.lat + (this.targetPos.lat - this.currentPos.lat) * ease,
      lng: this.currentPos.lng + (this.targetPos.lng - this.currentPos.lng) * ease,
      altitude: this.currentPos.altitude + (this.targetPos.altitude - this.currentPos.altitude) * ease,
      heading: this.currentPos.heading + (this.targetPos.heading - this.currentPos.heading) * ease,
      pitch: this.currentPos.pitch + (this.targetPos.pitch - this.currentPos.pitch) * ease,
    };

    return this.currentPos;
  }
}
