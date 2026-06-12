"""Slice 3.3 — the embedding seam (free-tier edition).

Texts become vectors here. Same adapter discipline as images and publishers:
one protocol, swappable engines, so the Company Brain never knows or cares
who computed its vectors.

  * CloudflareEmbeddingEngine — @cf/baai/bge-m3 on Workers AI: the EXACT
    model the blueprint specifies (1024-dim), on the free tier, with the SAME
    credentials the image engine already uses. MVP cost: ₹0.
  * StubEmbeddingEngine — deterministic vectors for tests; texts sharing
    words land near each other, so retrieval ordering is actually testable.
  * Phase 4 seat: BGE-M3 on the founder-owned GPU behind this same protocol.
"""

import hashlib
import math
import re
from typing import Protocol

import httpx

BGE_M3_DIM = 1024


class EmbeddingError(Exception):
    pass


class EmbeddingEngine(Protocol):
    name: str
    dim: int

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """One vector per input text, same order. Raises EmbeddingError."""
        ...


class CloudflareEmbeddingEngine:
    """Workers AI BGE-M3 — free-tier allowance covers MVP ingestion + per-run
    retrieval comfortably. Batches are kept small to respect the API."""

    name = "cloudflare/bge-m3"
    dim = BGE_M3_DIM
    MODEL = "@cf/baai/bge-m3"
    BATCH = 50

    def __init__(self, account_id: str, api_token: str, transport=None):
        self._url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{self.MODEL}"
        )
        self._headers = {"Authorization": f"Bearer {api_token}"}
        self._transport = transport  # tests inject httpx.MockTransport

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(timeout=60.0, transport=self._transport) as client:
            for start in range(0, len(texts), self.BATCH):
                batch = texts[start : start + self.BATCH]
                resp = await client.post(
                    self._url, headers=self._headers, json={"text": batch}
                )
                if resp.status_code != 200:
                    raise EmbeddingError(
                        f"workers-ai embedding failed: HTTP {resp.status_code}"
                    )
                payload = resp.json()
                data = (payload.get("result") or {}).get("data")
                if not data or len(data) != len(batch):
                    raise EmbeddingError("workers-ai embedding returned unexpected shape")
                vectors.extend(data)
        return vectors


class StubEmbeddingEngine:
    """Deterministic bag-of-words hashing: each word lights up a few stable
    dimensions, so 'chai pricing' sits near 'chai machines' and far from
    'fintech compliance'. No model, no network, fully reproducible."""

    name = "stub"

    def __init__(self, dim: int = 64):
        self.dim = dim

    def _vector(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            digest = hashlib.sha256(word.encode()).digest()
            for i in range(3):  # each word lights 3 stable dimensions
                vec[digest[i] % self.dim] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]


def cosine(a: list[float], b: list[float]) -> float:
    """Exact cosine similarity — the MVP's entire 'index'. At the MVP corpus
    cap (~1.5k chunks/founder) brute force runs in milliseconds with perfect
    recall; HNSW arrives with the Pro upgrade, not before it's needed."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
