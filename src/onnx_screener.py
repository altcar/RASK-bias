"""ONNX inference for the app: one model, two screeners (biased vs LEACE-debiased).

Runs on onnxruntime + tokenizer only (no PyTorch needed at serving time).
"""
import json

import numpy as np

from .attributes import GENDERS, REGIONS, gender_names, locations, with_identity
from .config import CALIBRATION_JSON
from .screener import chunk_text, normalize

MODES = {"biased": "biased_emb", "leace": "fair_emb"}


class OnnxScreener:
    def __init__(self):
        import onnxruntime as ort
        from transformers import AutoTokenizer

        from .export_onnx import MAX_TOKENS, ONNX_DIR, ONNX_PATH

        self.tok = AutoTokenizer.from_pretrained(ONNX_DIR)
        self.sess = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
        self.max_tokens = MAX_TOKENS
        self.calibration = json.loads(CALIBRATION_JSON.read_text())

    def embed(self, texts, batch_size=32):
        """Document embeddings for both screeners: (biased, fair), each (n, d) unit-norm."""
        chunked = [chunk_text(t) for t in texts]
        flat = [c for cs in chunked for c in cs]
        outs_b, outs_f = [], []
        for i in range(0, len(flat), batch_size):
            enc = self.tok(flat[i:i + batch_size], padding=True, truncation=True,
                           max_length=self.max_tokens, return_tensors="np")
            b, f = self.sess.run(["biased_emb", "fair_emb"], {
                "input_ids": enc["input_ids"].astype(np.int64),
                "attention_mask": enc["attention_mask"].astype(np.int64)})
            outs_b.append(b)
            outs_f.append(f)
        flat_b, flat_f = np.concatenate(outs_b), np.concatenate(outs_f)
        docs_b, docs_f, i = [], [], 0
        for cs in chunked:
            docs_b.append(flat_b[i:i + len(cs)].mean(0))
            docs_f.append(flat_f[i:i + len(cs)].mean(0))
            i += len(cs)
        return normalize(np.stack(docs_b)), normalize(np.stack(docs_f))

    def screen(self, cv_text, jd_text):
        """Score the CV as written plus its counterfactual twins, under both screeners.

        Returns {mode: {"score", "threshold", "passed", "counterfactuals": [...]}}.
        """
        twins = [("As written", "", cv_text)]
        female, male, last = gender_names("audit")[0]
        for region in REGIONS:
            city = locations(region, "audit")[0]
            for gender, first in zip(GENDERS, (female, male)):
                twins.append((region, gender, with_identity(cv_text, first, last, gender=gender, location=city)))

        cv_b, cv_f = self.embed([t for _, _, t in twins])
        jd_b, jd_f = self.embed([jd_text])
        result = {}
        for mode, cv, jd in (("biased", cv_b, jd_b), ("leace", cv_f, jd_f)):
            thr = self.calibration[mode]["threshold"]
            scores = (cv @ jd.T).ravel()
            rows = [{"location": loc, "gender": g, "score": float(s), "passed": bool(s >= thr)}
                    for (loc, g, _), s in zip(twins, scores)]
            cf = rows[1:]
            result[mode] = {
                "score": rows[0]["score"], "threshold": thr, "passed": rows[0]["passed"],
                "counterfactuals": cf,
                "consistent": len({r["passed"] for r in cf}) == 1,
                "max_gap": float(max(r["score"] for r in cf) - min(r["score"] for r in cf)),
            }
        return result
