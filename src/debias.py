"""Phase 3: LEACE debias layer - closed-form linear concept erasure (Belrose et al., 2023).

Goal: make the embedding carry no *linearly recoverable* information about the candidate's
location region or gender, while moving it as little as possible (least-squares optimal).

    Sigma_XX = Cov(X)               W  = Sigma_XX^(-1/2)  (whitening)   W+ = Sigma_XX^(1/2)
    Sigma_XZ = Cov(X, Z)            P  = orthogonal projector onto colspace(W Sigma_XZ)
    r(x)     = x - W+ P W (x - mu)

r is affine, so it is stored as  r(x) = x @ A + b  and can be appended to the ONNX model.

Fitting data are counterfactual copies of real resumes using only the "fit" names and
cities; the audit then uses held-out names and cities, so the eraser is tested on values
it never saw.
"""
import numpy as np

from .attributes import GENDERS, REGIONS, gender_names, locations, with_identity
from .config import ARTIFACTS, SEED
from .screener import Screener

LEACE_PATH = ARTIFACTS / "leace.npz"


def fit_leace(X, Z, eps=1e-6):
    """Return (A, b) such that X @ A + b is the LEACE-erased X."""
    mu = X.mean(axis=0)
    Xc, Zc = X - mu, Z - Z.mean(axis=0)
    n = len(X)
    sigma_xx = Xc.T @ Xc / n
    sigma_xz = Xc.T @ Zc / n

    evals, evecs = np.linalg.eigh(sigma_xx)
    keep = evals > eps * evals.max()
    evals, evecs = evals[keep], evecs[:, keep]
    W = evecs @ np.diag(evals ** -0.5) @ evecs.T
    W_pinv = evecs @ np.diag(evals ** 0.5) @ evecs.T

    u, s, _ = np.linalg.svd(W @ sigma_xz, full_matrices=False)
    Q = u[:, s > eps * s.max()]
    M = W_pinv @ Q @ Q.T @ W          # x - M (x - mu)
    A = np.eye(X.shape[1]) - M.T      # row-vector form
    b = mu @ M.T
    return A.astype(np.float32), b.astype(np.float32)


# Extra cities used ONLY to fit the eraser (never in the audit). Labelling each city
# separately lets LEACE erase the whole "where is this person" subspace, not just the
# 2 directions that 3 region labels would give.
FIT_CITIES = {
    "US": ["New York, NY, USA", "Houston, TX, USA", "Phoenix, AZ, USA", "Miami, FL, USA",
           "Detroit, MI, USA", "Portland, OR, USA", "Nashville, TN, USA", "San Diego, CA, USA"],
    "UK/Europe": ["Dublin, Ireland", "Rome, Italy", "Lisbon, Portugal", "Warsaw, Poland",
                  "Stockholm, Sweden", "Edinburgh, UK", "Vienna, Austria", "Brussels, Belgium"],
    "Asia": ["Jakarta, Indonesia", "Bangkok, Thailand", "Seoul, South Korea", "Tokyo, Japan",
             "Mumbai, India", "Hong Kong", "Taipei, Taiwan", "Penang, Malaysia"],
}


def leace_training_set(resumes, n_resumes=300):
    """Sampled resumes re-written with every fit city (and alternating fit gender names).

    Z = one-hot city (fine-grained location) + one-hot gender.
    """
    rng = np.random.default_rng(SEED)
    idx = rng.choice(len(resumes), size=min(n_resumes, len(resumes)), replace=False)
    pairs = gender_names("fit")
    cities = [c for region in REGIONS for c in FIT_CITIES[region] + locations(region, "fit")]
    texts, z = [], []
    for k, i in enumerate(idx):
        female, male, last = pairs[k % len(pairs)]
        for c_i, city in enumerate(cities):
            g_i = (k + c_i) % 2
            first = (female, male)[g_i]
            texts.append(with_identity(resumes.text.iloc[i], first, last, gender=GENDERS[g_i], location=city))
            onehot = np.zeros(len(cities) + len(GENDERS))
            onehot[c_i] = 1
            onehot[len(cities) + g_i] = 1
            z.append(onehot)
    return texts, np.stack(z)


class LeaceScreener(Screener):
    name = "leace"
    description = "MiniLM + LEACE eraser for location region and gender"

    def __init__(self, embedder, A=None, b=None):
        super().__init__(embedder)
        self.A, self.b = A, b

    def fit(self, resumes):
        texts, Z = leace_training_set(resumes)
        X = self.embedder.encode(texts, show_progress=True, normalize_mean=False)
        self.A, self.b = fit_leace(X, Z)
        np.savez(LEACE_PATH, A=self.A, b=self.b)
        return self

    @classmethod
    def load(cls, embedder):
        d = np.load(LEACE_PATH)
        return cls(embedder, d["A"], d["b"])

    def transform(self, emb):
        return emb @ self.A + self.b


def build_method(method, embedder, resumes):
    if method == "leace":
        from .data import load_resumes
        return LeaceScreener(embedder).fit(load_resumes())
    raise ValueError(f"Unknown method {method!r}")
