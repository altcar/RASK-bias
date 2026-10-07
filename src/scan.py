"""Phase 1: scan resumes and job postings for gender, location, education and other cues.

Usage:  python -m src.scan
Writes: artifacts/scan_resumes.csv, artifacts/scan_jobs.csv, artifacts/scan_summary.md
"""
import re

import pandas as pd

from .attributes import EDU_LEVELS, LOCATION_PLACEHOLDER, countries_mentioned, education_level
from .config import ARTIFACTS
from .data import build_jobs, load_resumes
from .redact import CUE_PATTERNS

FEMALE_CUES = re.compile(r"\b(she|her|hers|herself|Mrs\.|Ms\.|women'?s|sorority)\b", re.I)
MALE_CUES = re.compile(r"\b(he|him|his|himself|Mr\.|men'?s|fraternity)\b", re.I)
OTHER_CUES = ["race_ethnicity", "age", "marital_family", "religion", "nationality", "disability_veteran"]


def scan_resume(text):
    female, male = len(FEMALE_CUES.findall(text)), len(MALE_CUES.findall(text))
    row = {
        "edu_level": education_level(text),
        "female_cues": female,
        "male_cues": male,
        "gender_signal": "Female" if female > male else "Male" if male > female else "None",
        "location_masked": bool(LOCATION_PLACEHOLDER.search(text)),
        "countries": ";".join(countries_mentioned(text)),
    }
    for cue in OTHER_CUES:
        row[cue] = len(CUE_PATTERNS[cue].findall(text))
    return row


def _pct(x):
    return f"{100 * x:.1f}%"


def summarize(res, jobs):
    n = len(res)
    lines = ["# Phase 1 - Data scan", "", f"Resumes: **{n}** across **{res.Category.nunique()}** categories. "
             f"Job postings sampled from LinkedIn (US only): **{len(jobs)}**.", ""]

    lines += ["## Gender", "",
              "| Signal | Resumes |", "|---|---|"]
    for k, v in res.gender_signal.value_counts().items():
        lines.append(f"| {k} | {v} ({_pct(v / n)}) |")
    lines += ["", "Names are removed from the dataset, so gender is mostly invisible. "
              "The audit injects a gendered name + pronoun into otherwise identical resumes.", ""]

    countries = res.countries.str.split(";").explode().replace("", pd.NA).dropna()
    lines += ["## Location", "",
              f"- Location masked as 'City, State': **{_pct(res.location_masked.mean())}**",
              f"- Resumes mentioning any country: **{_pct((res.countries != '').mean())}**", "",
              "| Country mentioned | Resumes |", "|---|---|"]
    for k, v in countries.value_counts().items():
        lines.append(f"| {k} | {v} ({_pct(v / n)}) |")
    lines += ["", "The audit fills the 'City, State' placeholders with a US, UK/Europe or Asia location "
              "and scores against US job postings.", ""]

    lines += ["## Education level (highest found)", "", "| Level | Resumes |", "|---|---|"]
    for lvl in range(len(EDU_LEVELS)):
        v = (res.edu_level == lvl).sum()
        lines.append(f"| {EDU_LEVELS[lvl]} | {v} ({_pct(v / n)}) |")

    req = jobs.groupby("Category").required_edu.max()
    res = res.assign(job_req=res.Category.map(req))
    meets = (res.edu_level >= res.job_req).mean()
    lines += ["", "### Job requirements (requirement-aware)", "",
              f"- Job postings stating a *required* degree: **{_pct((jobs.required_edu > 0).mean())}** "
              f"(the rest say none, 'preferred', or 'or equivalent experience')",
              f"- Resumes meeting the strictest requirement among their category's jobs: **{_pct(meets)}**", "",
              "| Required level | Postings |", "|---|---|"]
    for k, v in jobs.required_edu.value_counts().sort_index().items():
        lines.append(f"| {EDU_LEVELS[k]} | {v} |")

    lines += ["", "## Other protected-attribute cues", "", "| Cue | Resumes containing it |", "|---|---|"]
    for cue in OTHER_CUES:
        lines.append(f"| {cue} | {_pct((res[cue] > 0).mean())} |")

    lines += ["", "## Education by category", "", "| Category | " + " | ".join(EDU_LEVELS) + " |",
              "|---|" + "---|" * len(EDU_LEVELS)]
    tab = pd.crosstab(res.Category, res.edu_level, normalize="index").reindex(columns=range(len(EDU_LEVELS)), fill_value=0)
    for cat, row in tab.iterrows():
        lines.append(f"| {cat} | " + " | ".join(f"{100 * x:.0f}%" for x in row) + " |")
    return "\n".join(lines) + "\n"


def main():
    res = load_resumes()
    jobs = build_jobs()
    scanned = pd.concat([res[["ID", "Category"]], pd.DataFrame([scan_resume(t) for t in res.text])], axis=1)
    scanned["edu_name"] = scanned.edu_level.map(lambda i: EDU_LEVELS[i])

    ARTIFACTS.mkdir(exist_ok=True)
    scanned.to_csv(ARTIFACTS / "scan_resumes.csv", index=False)
    jobs.assign(required_edu_name=jobs.required_edu.map(lambda i: EDU_LEVELS[i])).drop(columns="text").to_csv(
        ARTIFACTS / "scan_jobs.csv", index=False)
    summary = summarize(scanned, jobs)
    (ARTIFACTS / "scan_summary.md").write_text(summary)
    print(summary)


if __name__ == "__main__":
    main()
