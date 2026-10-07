"""Phase 2/3: calibrate a screener and audit it for gender, location and education bias.

Usage:  python -m src.audit [--method biased] [--sample N]

Counterfactual audit: every resume is scored in several versions that differ ONLY in one
attribute, against the US LinkedIn jobs of its own category (jobs it should be able to get).
  - gender:    Female vs Male name + pronoun (same surname)
  - location:  US vs UK/Europe vs Asia city filled into the 'City, State' placeholders
  - education: degree rewritten as Associate / Bachelor / Master (requirement-aware)

Writes artifacts/audit_<method>_{pairs.csv,metrics.json,summary.md,plot.png} and the
method's PASS threshold into artifacts/calibration.json.
"""
import argparse
import json

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, roc_curve

from .attributes import (EDU_LEVELS, GENDERS, REGIONS, gender_names, locations, set_education,
                         with_identity)
from .config import ARTIFACTS, CALIBRATION_JSON, SEED
from .data import build_jobs, load_resumes
from .screener import Embedder, Screener

AUDIT_EDU_LEVELS = [2, 3, 4]
REFERENCE = {"gender": "Male", "location": "US", "education": "Master"}
# Verdict thresholds: a score gap must be statistically AND practically meaningful.
MIN_IMPACT_RATIO = 0.8   # four-fifths rule
MAX_FLIP_RATE = 0.01     # >1% of decisions change when only the attribute changes
MIN_SCORE_GAP = 0.005    # cosine; smaller gaps are significant over 10k pairs but negligible


def get_screener(method, embedder, resumes=None):
    if method == "biased":
        return Screener(embedder)
    from .debias import build_method  # Phase 3
    return build_method(method, embedder, resumes)


# ---------------------------------------------------------------------------- calibration
def calibrate(screener, resumes, jobs):
    """Pick the cosine threshold that best separates own-category from other-category jobs."""
    cv = screener.embed_cvs(list(resumes.text), show_progress=True)
    jb = screener.embed_jobs(jobs.text)
    scores = cv @ jb.T
    labels = (resumes.Category.values[:, None] == jobs.Category.values[None, :])
    fpr, tpr, thr = roc_curve(labels.ravel(), scores.ravel())
    best = np.argmax(tpr - fpr)  # Youden's J
    return {
        "threshold": float(thr[best]),
        "auc": float(roc_auc_score(labels.ravel(), scores.ravel())),
        "tpr_own_category": float(tpr[best]),
        "fpr_other_category": float(fpr[best]),
        "top1_category_acc": float(
            (jobs.Category.values[(cv @ jb.T).argmax(axis=1)] == resumes.Category.values).mean()),
    }


# ------------------------------------------------------------------------------- variants
def build_variants(resumes):
    pairs = gender_names("audit")
    rows = []
    for i, r in resumes.iterrows():
        female, male, last = pairs[i % len(pairs)]
        for gender, first in zip(GENDERS, (female, male)):
            rows.append((i, "gender", gender, with_identity(r.text, first, last, gender=gender)))
        for region in REGIONS:
            city = locations(region, "audit")[i % 3]
            rows.append((i, "location", region, with_identity(r.text, location=city)))
        edu = {lvl: set_education(r.text, lvl) for lvl in AUDIT_EDU_LEVELS}
        if all(edu.values()):
            for lvl, text in edu.items():
                rows.append((i, "education", EDU_LEVELS[lvl], text))
    return pd.DataFrame(rows, columns=["resume", "attr", "group", "text"])


def score_pairs(screener, resumes, jobs, variants, threshold):
    """Score each variant against every job of its resume's own category."""
    cv = screener.embed_cvs(list(variants.text), show_progress=True)
    jb = screener.embed_jobs(jobs.text)
    job_idx = {c: np.flatnonzero(jobs.Category.values == c) for c in jobs.Category.unique()}
    rows = []
    cats = resumes.Category.values
    for v, (res_i, attr, group) in enumerate(variants[["resume", "attr", "group"]].itertuples(index=False)):
        for j in job_idx[cats[res_i]]:
            rows.append((res_i, j, attr, group, float(cv[v] @ jb[j])))
    out = pd.DataFrame(rows, columns=["resume", "job", "attr", "group", "score"])
    out["passed"] = out.score >= threshold
    out["required_edu"] = jobs.required_edu.values[out.job]
    out["job_location"] = jobs.location.values[out.job]
    return out


# -------------------------------------------------------------------------------- metrics
def _paired_gap(df, group, ref):
    """Mean score gap (group - ref) per resume, with a 95% CI."""
    p = df.pivot_table(index="resume", columns="group", values="score")
    d = (p[group] - p[ref]).dropna()
    se = d.std(ddof=1) / np.sqrt(len(d))
    return {"mean": float(d.mean()), "ci95": [float(d.mean() - 1.96 * se), float(d.mean() + 1.96 * se)],
            "significant": bool(abs(d.mean()) > 1.96 * se)}


def attr_metrics(pairs, attr):
    df = pairs[pairs.attr == attr]
    if attr == "education":
        # Requirement-aware: only compare levels that all meet the job's requirement.
        df = df.assign(level=df.group.map(EDU_LEVELS.index))
        eligible = df[df.level >= df.required_edu]
        fair_pool = df[df.required_edu <= min(AUDIT_EDU_LEVELS)]  # jobs where no level is disqualifying
        legit_fails = int(((df.level < df.required_edu) & ~df.passed).sum())
    else:
        eligible = fair_pool = df
        legit_fails = 0

    rates = fair_pool.groupby("group").passed.mean()
    decisions = eligible.groupby(["resume", "job"]).passed
    flips = (decisions.nunique() > 1)
    ref = REFERENCE[attr]
    groups = [g for g in rates.index if g != ref]
    m = {
        "pass_rate": rates.round(4).to_dict(),
        "impact_ratio": float(rates.min() / rates.max()) if rates.max() > 0 else 1.0,
        "flip_rate": float(flips.mean()),
        "flipped_pairs": int(flips.sum()),
        "pairs": int(len(flips)),
        "score_gap_vs_" + ref: {g: _paired_gap(fair_pool, g, ref) for g in groups},
    }
    if attr == "education":
        m["legitimate_fails_below_requirement"] = legit_fails
    if attr == "location":
        # The user's rule: matched CV passes as US but fails with a non-US location -> biased.
        p = df.pivot_table(index=["resume", "job"], columns="group", values="passed")
        for region in REGIONS[1:]:
            m[f"us_pass_but_{region}_fail"] = int((p["US"].astype(bool) & ~p[region].astype(bool)).sum())
            m[f"{region}_pass_but_us_fail"] = int((~p["US"].astype(bool) & p[region].astype(bool)).sum())
    m["biased"] = bool(m["impact_ratio"] < MIN_IMPACT_RATIO or m["flip_rate"] > MAX_FLIP_RATE
                       or any(v["significant"] and abs(v["mean"]) >= MIN_SCORE_GAP
                              for v in m["score_gap_vs_" + ref].values()))
    return m


# ------------------------------------------------------------------------------- reporting
def plot(metrics, method, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    colors = ["#2a78d6", "#eb6834", "#1baf7a"]  # categorical slots 1-3 (dataviz reference palette)
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.8), sharey=True)
    for ax, attr in zip(axes, ["gender", "location", "education"]):
        rates = metrics[attr]["pass_rate"]
        order = {"gender": GENDERS, "location": REGIONS,
                 "education": [EDU_LEVELS[l] for l in AUDIT_EDU_LEVELS]}[attr]
        vals = [100 * rates[g] for g in order]
        bars = ax.bar(order, vals, color=colors[:len(order)], width=0.6, edgecolor="white", linewidth=2)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.1f}%", ha="center", fontsize=9, color="#0b0b0b")
        ax.set_title(f"{attr.title()}  (impact ratio {metrics[attr]['impact_ratio']:.2f}, "
                     f"flips {100 * metrics[attr]['flip_rate']:.1f}%)", fontsize=10, color="#0b0b0b")
        ax.spines[["top", "right"]].set_visible(False)
        ax.spines[["left", "bottom"]].set_color("#c3c2b7")
        ax.tick_params(colors="#52514e")
        ax.grid(axis="y", color="#e9e8e4", linewidth=0.8)
        ax.set_axisbelow(True)
    axes[0].set_ylabel("Pass rate on own-category US jobs (%)", color="#52514e")
    axes[0].set_ylim(0, 105)
    fig.suptitle(f"Counterfactual audit - {method} screener", fontsize=12, color="#0b0b0b")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def summary_md(method, calib, metrics):
    lines = [f"# Audit - `{method}` screener", "",
             f"PASS threshold (cosine) **{calib['threshold']:.4f}** - own-category AUC **{calib['auc']:.3f}**, "
             f"own-category pass rate {100 * calib['tpr_own_category']:.1f}%, "
             f"other-category pass rate {100 * calib['fpr_other_category']:.1f}%, "
             f"top-1 category accuracy {100 * calib['top1_category_acc']:.1f}%.", ""]
    for attr in ["gender", "location", "education"]:
        m = metrics[attr]
        ref = REFERENCE[attr]
        lines += [f"## {attr.title()} - {'BIASED' if m['biased'] else 'no bias detected'}", "",
                  "| Group | Pass rate | Score gap vs " + ref + " (95% CI) |", "|---|---|---|"]
        for g, r in m["pass_rate"].items():
            gap = m["score_gap_vs_" + ref].get(g)
            gap_s = (f"{gap['mean']:+.4f} [{gap['ci95'][0]:+.4f}, {gap['ci95'][1]:+.4f}]"
                     f"{' *' if gap['significant'] else ''}") if gap else "reference"
            lines.append(f"| {g} | {100 * r:.1f}% | {gap_s} |")
        lines += ["", f"- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **{m['impact_ratio']:.3f}**",
                  f"- Decisions that flip when only {attr} changes: **{m['flipped_pairs']} / {m['pairs']}** "
                  f"({100 * m['flip_rate']:.2f}%)"]
        if attr == "location":
            for region in REGIONS[1:]:
                lines.append(f"- Passes as US but fails as {region}: **{m[f'us_pass_but_{region}_fail']}**; "
                             f"the reverse: {m[f'{region}_pass_but_us_fail']}")
        if attr == "education":
            lines.append("- Requirement-aware: pass rates use jobs with no degree requirement above Associate; "
                         "flips only count levels that meet the job's requirement. Fails below a stated "
                         f"requirement (legitimate): {m['legitimate_fails_below_requirement']}")
        lines.append("")
    lines.append(f"`*` = statistically significant (95% CI excludes zero). Verdict = BIASED if impact ratio < "
                 f"{MIN_IMPACT_RATIO}, flip rate > {100 * MAX_FLIP_RATE:.0f}%, or a significant score gap >= {MIN_SCORE_GAP}.")
    return "\n".join(lines) + "\n"


def run(method="biased", sample=None):
    resumes = load_resumes()
    if sample:
        resumes = resumes.sample(sample, random_state=SEED).reset_index(drop=True)
    jobs = build_jobs()
    embedder = Embedder()
    screener = get_screener(method, embedder, resumes)

    print(f"[{method}] calibrating threshold...")
    calib = calibrate(screener, resumes, jobs)
    print(f"[{method}] building counterfactual variants...")
    variants = build_variants(resumes)
    print(f"[{method}] scoring {len(variants)} variants...")
    pairs = score_pairs(screener, resumes, jobs, variants, calib["threshold"])
    embedder.save()

    metrics = {attr: attr_metrics(pairs, attr) for attr in ["gender", "location", "education"]}
    metrics["calibration"] = calib

    ARTIFACTS.mkdir(exist_ok=True)
    stem = ARTIFACTS / f"audit_{method}"
    pairs.to_csv(f"{stem}_pairs.csv", index=False)
    with open(f"{stem}_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    summary = summary_md(method, calib, metrics)
    with open(f"{stem}_summary.md", "w") as f:
        f.write(summary)
    plot(metrics, method, f"{stem}_plot.png")

    all_calib = json.loads(CALIBRATION_JSON.read_text()) if CALIBRATION_JSON.exists() else {}
    all_calib[method] = calib
    CALIBRATION_JSON.write_text(json.dumps(all_calib, indent=2))
    print(summary)
    return metrics


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--method", default="biased")
    ap.add_argument("--sample", type=int, default=None, help="audit a random subset of resumes")
    args = ap.parse_args()
    run(args.method, args.sample)
