import os from 'os';

export interface GpuWorkerNode {
  workerId: string;
  hostname: string;
  gpuModel: string;
  vramTotalMb: number;
  vramUsedMb: number;
  gpuUtilizationPercent: number;
  activeJobsCount: number;
  status: 'ONLINE' | 'BUSY' | 'DRAINING' | 'OFFLINE';
  lastHeartbeat: string;
}

export class GpuWorkerClusterService {
  private static workerNodes = new Map<string, GpuWorkerNode>();

  public static init() {
    // Register primary GPU worker node contract
    const primaryNodeId = `gpu-node-${os.hostname().replace(/[^a-zA-Z0-9]/g, '-')}-01`;
    this.registerWorker({
      workerId: primaryNodeId,
      hostname: os.hostname(),
      gpuModel: 'NVIDIA Tensor Core L4 / T4 (PyTorch CUDA 12.1)',
      vramTotalMb: 16384,
      vramUsedMb: 2450,
      gpuUtilizationPercent: 18.5,
      activeJobsCount: 0,
      status: 'ONLINE',
      lastHeartbeat: new Date().toISOString()
    });
  }

  public static registerWorker(node: GpuWorkerNode): GpuWorkerNode {
    node.lastHeartbeat = new Date().toISOString();
    this.workerNodes.set(node.workerId, node);
    return node;
  }

  public static heartbeat(workerId: string, gpuUtil: number, activeJobs: number, vramUsedMb: number): boolean {
    const node = this.workerNodes.get(workerId);
    if (!node) return false;
    node.gpuUtilizationPercent = gpuUtil;
    node.activeJobsCount = activeJobs;
    node.vramUsedMb = vramUsedMb;
    node.status = activeJobs > 4 ? 'BUSY' : 'ONLINE';
    node.lastHeartbeat = new Date().toISOString();
    return true;
  }

  public static getClusterStatus() {
    this.init();
    const nodes = Array.from(this.workerNodes.values());
    const totalVram = nodes.reduce((sum, n) => sum + n.vramTotalMb, 0);
    const usedVram = nodes.reduce((sum, n) => sum + n.vramUsedMb, 0);
    const activeJobs = nodes.reduce((sum, n) => sum + n.activeJobsCount, 0);

    return {
      clusterState: 'HEALTHY',
      totalWorkerNodes: nodes.length,
      activeNodes: nodes.filter(n => n.status !== 'OFFLINE').length,
      totalVramMb: totalVram,
      usedVramMb: usedVram,
      avgGpuUtilization: nodes.length > 0 ? Number((nodes.reduce((sum, n) => sum + n.gpuUtilizationPercent, 0) / nodes.length).toFixed(1)) : 0,
      totalActiveJobs: activeJobs,
      nodes
    };
  }
}
