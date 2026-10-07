"""Shared paths and constants."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "Data"
RESUME_CSV = DATA_DIR / "Resume.csv"
ARTIFACTS = ROOT / "artifacts"
JOBS_CSV = ARTIFACTS / "jobs.csv"
CALIBRATION_JSON = ARTIFACTS / "calibration.json"
EMBED_CACHE = ARTIFACTS / "embed_cache"

# Pretrained embedding model used as the (biased) screener.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# PASS = score in the top PASS_RATE of candidates for that job.
PASS_RATE = 0.30

# LinkedIn postings sampled per resume category to form its job description(s).
JOBS_PER_CATEGORY = 5

SEED = 42
