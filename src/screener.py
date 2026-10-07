"""Embedding-based resume screener (the biased baseline).

A CV is scored by cosine similarity between its embedding and the job description's
embedding; PASS if the score clears a threshold calibrated on the dataset. Nothing here
looks at gender, location or education explicitly - any gap comes from associations the
pretrained model learned, triggered by the text.

MiniLM reads at most 256 tokens, so long texts are split into ~CHUNK_WORDS-word chunks
whose embeddings are averaged (otherwise the Education section would never be seen).
"""
import hashlib
import pickle

import numpy as np

from .config import EMBED_CACHE, MODEL_NAME

CHUNK_WORDS = 180


def chunk_text(text, size=CHUNK_WORDS):
    words = text.split()
    return [" ".join(words[i:i + size]) for i in range(0, max(len(words), 1), size)]


def normalize(x):
    return x / np.linalg.norm(x, axis=-1, keepdims=True).clip(1e-12)


class Embedder:
    """SentenceTransformer chunk encoder with a persistent cache keyed by chunk hash.

    Caching per chunk means counterfactual variants that only differ in their header
    re-embed one chunk, not the whole resume.
    """

    def __init__(self, model_name=MODEL_NAME, use_cache=True):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name)
        self.cache_path = EMBED_CACHE / (model_name.replace("/", "__") + ".pkl")
        self.use_cache = use_cache
        self.cache = {}
        if use_cache and self.cache_path.exists():
            with open(self.cache_path, "rb") as f:
                self.cache = pickle.load(f)

    @staticmethod
    def _key(text):
        return hashlib.sha1(text.encode("utf-8")).hexdigest()

    def encode_chunks(self, chunks, batch_size=64, show_progress=False):
        keys = [self._key(c) for c in chunks]
        missing = dict(zip(keys, chunks))
        missing = {k: c for k, c in missing.items() if k not in self.cache}
        if missing:
            vecs = self.model.encode(list(missing.values()), batch_size=batch_size,
                                     normalize_embeddings=True, show_progress_bar=show_progress)
            self.cache.update(zip(missing.keys(), vecs.astype(np.float32)))
        return np.stack([self.cache[k] for k in keys])

    def encode(self, texts, show_progress=False, normalize_mean=True):
        """One embedding per text: the mean of its (unit-norm) chunk embeddings.

        normalize_mean=False returns the raw mean; debias layers are affine and act on it, so
        applying them per chunk (as the ONNX model does) gives exactly the same result.
        """
        chunked = [chunk_text(t) for t in texts]
        flat = [c for cs in chunked for c in cs]
        vecs = self.encode_chunks(flat, show_progress=show_progress)
        out, i = [], 0
        for cs in chunked:
            out.append(vecs[i:i + len(cs)].mean(axis=0))
            i += len(cs)
        out = np.stack(out)
        return normalize(out) if normalize_mean else out

    def save(self):
        if self.use_cache:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_path, "wb") as f:
                pickle.dump(self.cache, f)


class Screener:
    """Baseline screener: embeds the CV exactly as written."""

    name = "biased"
    description = "Pretrained MiniLM similarity on the CV as written"

    def __init__(self, embedder: Embedder):
        self.embedder = embedder

    def transform(self, emb):
        """Debias hook (Phase 3): affine map applied to the raw mean chunk embedding."""
        return emb

    def embed(self, texts, show_progress=False):
        raw = self.embedder.encode(list(texts), show_progress=show_progress, normalize_mean=False)
        return normalize(self.transform(raw))

    embed_cvs = embed
    embed_jobs = embed
