"""Phase 4: export MiniLM + mean pooling + LEACE eraser to one ONNX model.

Usage:  python -m src.export_onnx
Writes: artifacts/onnx/screener.onnx (+ tokenizer files)

Inputs : input_ids, attention_mask            (one row per text chunk)
Outputs: biased_emb  - unit-norm MiniLM chunk embedding (the original screener)
         fair_emb    - the same embedding after the LEACE eraser (x @ A + b)
Averaging chunk outputs gives the document embedding for either screener; LEACE is affine,
so erasing per chunk then averaging equals averaging then erasing.
"""
import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

from .config import ARTIFACTS, MODEL_NAME
from .debias import LEACE_PATH

ONNX_DIR = ARTIFACTS / "onnx"
ONNX_PATH = ONNX_DIR / "screener.onnx"
MAX_TOKENS = 256  # MiniLM's max_seq_length in sentence-transformers


class ScreenerGraph(torch.nn.Module):
    def __init__(self, encoder, A, b):
        super().__init__()
        self.encoder = encoder
        self.register_buffer("A", torch.from_numpy(A))
        self.register_buffer("b", torch.from_numpy(b))

    def forward(self, input_ids, attention_mask):
        hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
        pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
        biased = torch.nn.functional.normalize(pooled, dim=-1)
        fair = biased @ self.A + self.b
        return biased, fair


def main():
    tok = AutoTokenizer.from_pretrained(MODEL_NAME)
    encoder = AutoModel.from_pretrained(MODEL_NAME).eval()
    leace = np.load(LEACE_PATH)
    graph = ScreenerGraph(encoder, leace["A"], leace["b"]).eval()

    ONNX_DIR.mkdir(parents=True, exist_ok=True)
    sample = tok(["hello world", "a longer example sentence"], padding=True, return_tensors="pt")
    torch.onnx.export(
        graph, (sample["input_ids"], sample["attention_mask"]), str(ONNX_PATH),
        input_names=["input_ids", "attention_mask"], output_names=["biased_emb", "fair_emb"],
        dynamic_axes={"input_ids": {0: "batch", 1: "seq"}, "attention_mask": {0: "batch", 1: "seq"},
                      "biased_emb": {0: "batch"}, "fair_emb": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    tok.save_pretrained(ONNX_DIR)
    print(f"Exported {ONNX_PATH} ({ONNX_PATH.stat().st_size / 1e6:.1f} MB)")
    verify()


def verify():
    """Check ONNX document scores match the PyTorch screeners used in the audit."""
    from .data import build_jobs, load_resumes
    from .debias import LeaceScreener
    from .onnx_screener import OnnxScreener
    from .screener import Embedder, Screener

    texts = list(load_resumes().text.sample(20, random_state=0)) + list(build_jobs().text[:5])
    emb = Embedder(use_cache=False)
    ref_b = Screener(emb).embed(texts)
    ref_f = LeaceScreener.load(emb).embed(texts)
    onnx = OnnxScreener()
    got_b, got_f = onnx.embed(texts)
    print(f"max |diff| biased={np.abs(ref_b - got_b).max():.2e}  fair={np.abs(ref_f - got_f).max():.2e}")


if __name__ == "__main__":
    main()
