// ParticleEngine.ts - High performance travelling particles along collaboration arcs
export interface TravelingParticle {
  id: string;
  arcId: string;
  progress: number; // 0.0 to 1.0
  speed: number;
  color: string;
  size: number;
}

export class ParticleEngine {
  private particles: TravelingParticle[] = [];

  public spawnParticle(arcId: string, color: string = '#38bdf8', speed: number = 0.015): void {
    this.particles.push({
      id: `p-${Date.now()}-${Math.random()}`,
      arcId,
      progress: 0.0,
      speed,
      color,
      size: 3,
    });
  }

  public update(): TravelingParticle[] {
    this.particles.forEach((p) => {
      p.progress += p.speed;
    });
    this.particles = this.particles.filter((p) => p.progress <= 1.0);
    return this.particles;
  }
}
