"""
SONARA SERVER v1.0 - Hardware Resource Monitoring Service (GPU VRAM & System RAM)
"""
import psutil
from typing import Dict, Any
from sonara_server.config import logger

class MonitorService:
    @staticmethod
    def get_ram_stats() -> Dict[str, Any]:
        try:
            mem = psutil.virtual_memory()
            return {
                "total_mb": round(mem.total / (1024 * 1024), 2),
                "used_mb": round(mem.used / (1024 * 1024), 2),
                "free_mb": round(mem.available / (1024 * 1024), 2),
                "percentage": mem.percent
            }
        except Exception as e:
            logger.warn(f"[MONITOR] Failed to fetch RAM metrics: {e}")
            return {"total_mb": 0, "used_mb": 0, "free_mb": 0, "percentage": 0}

    @staticmethod
    def get_gpu_stats() -> Dict[str, Any]:
        try:
            import torch
            if torch.cuda.is_available():
                device_name = torch.cuda.get_device_name(0)
                total_vram = torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)
                reserved_vram = torch.cuda.memory_reserved(0) / (1024 * 1024)
                allocated_vram = torch.cuda.memory_allocated(0) / (1024 * 1024)
                free_vram = total_vram - reserved_vram
                return {
                    "available": True,
                    "device_name": device_name,
                    "total_vram_mb": round(total_vram, 2),
                    "used_vram_mb": round(allocated_vram, 2),
                    "reserved_vram_mb": round(reserved_vram, 2),
                    "free_vram_mb": round(free_vram, 2)
                }
        except Exception as e:
            logger.warn(f"[MONITOR] CUDA stats fetch non-blocking notice: {e}")

        return {
            "available": False,
            "device_name": "N/A (CPU / Engine Fallback)",
            "total_vram_mb": 0.0,
            "used_vram_mb": 0.0,
            "reserved_vram_mb": 0.0,
            "free_vram_mb": 0.0
        }

monitor_service = MonitorService()
