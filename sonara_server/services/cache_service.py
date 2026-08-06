"""
SONARA SERVER v1.0 - Prompt Response Cache Service
"""
import hashlib
import time
import threading
from typing import Dict, Any, Optional
from sonara_server.config import logger

class CacheService:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self.hits = 0

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def compute_hash(self, prompt: str, genre: str, duration: int, seed: int) -> str:
        raw_key = f"{prompt.strip().lower()}:{genre.strip().lower()}:{duration}:{seed}"
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def get(self, cache_key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            if cache_key in self._cache:
                entry = self._cache[cache_key]
                if time.time() < entry["expires_at"]:
                    self.hits += 1
                    logger.info(f"[CACHE_SERVICE] Cache HIT for key: {cache_key[:12]}...")
                    return entry["data"]
                else:
                    del self._cache[cache_key]
        return None

    def set(self, cache_key: str, data: Dict[str, Any], ttl_seconds: int = 86400):
        with self._lock:
            self._cache[cache_key] = {
                "data": data,
                "expires_at": time.time() + ttl_seconds
            }

cache_service = CacheService.get_instance()
