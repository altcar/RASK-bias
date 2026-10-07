"""Loading the Kaggle resume dataset and the LinkedIn job listings."""
import re

import pandas as pd

from .attributes import required_education
from .config import JOBS_CSV, JOBS_PER_CATEGORY, RESUME_CSV, SEED

# Title keywords used to match LinkedIn postings to each resume category.
CATEGORY_KEYWORDS = {
    "ACCOUNTANT": ["accountant"],
    "ADVOCATE": ["attorney", "lawyer", "legal counsel", "paralegal"],
    "AGRICULTURE": ["agriculture", "agricultural", "agronomist", "agronomy", "farm manager", "crop"],
    "APPAREL": ["apparel", "fashion"],
    "ARTS": ["artist", "art director", "art teacher", "museum", "gallery"],
    "AUTOMOBILE": ["automotive", "auto technician", "auto mechanic"],
    "AVIATION": ["aviation", "airline pilot", "helicopter", "aircraft", "aircraft mechanic", "aircraft technician", "flight"],
    "BANKING": ["banker", "bank teller", "teller", "branch manager"],
    "BPO": ["call center", "customer service representative"],
    "BUSINESS-DEVELOPMENT": ["business development"],
    "CHEF": ["chef", "cook"],
    "CONSTRUCTION": ["construction"],
    "CONSULTANT": ["management consultant", "business consultant", "it consultant", "strategy consultant", "consultant"],
    "DESIGNER": ["graphic designer", "interior designer", "ux designer", "product designer"],
    "DIGITAL-MEDIA": ["digital media", "social media", "digital marketing"],
    "ENGINEERING": ["engineer"],
    "FINANCE": ["financial analyst", "finance manager"],
    "FITNESS": ["fitness", "personal trainer"],
    "HEALTHCARE": ["registered nurse", "medical assistant", "healthcare", "patient care"],
    "HR": ["human resources", "hr generalist", "hr manager"],
    "INFORMATION-TECHNOLOGY": ["it support", "it manager", "it specialist", "it technician", "systems administrator", "help desk"],
    "PUBLIC-RELATIONS": ["public relations", "communications manager", "communications specialist", "media relations"],
    "SALES": ["sales"],
    "TEACHER": ["teacher"],
}


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text)).strip()


def load_resumes() -> pd.DataFrame:
    df = pd.read_csv(RESUME_CSV, usecols=["ID", "Resume_str", "Category"])
    df["text"] = df["Resume_str"].map(clean_text)
    return df[["ID", "Category", "text"]].reset_index(drop=True)


def build_jobs(force: bool = False) -> pd.DataFrame:
    """Pick JOBS_PER_CATEGORY LinkedIn postings per category; cached to artifacts/jobs.csv."""
    if JOBS_CSV.exists() and not force:
        return pd.read_csv(JOBS_CSV)

    from datasets import load_dataset

    raw = load_dataset("datastax/linkedin_job_listings", split="train").to_pandas()
    raw = raw.dropna(subset=["title", "description"])
    raw = raw[raw["description"].str.len() > 500]
    # US-based postings only, so non-US CVs can be tested against US jobs.
    raw = raw[raw["location"].fillna("").str.contains(r", [A-Z]{2}$|^United States$", regex=True)]
    titles = raw["title"].str.lower()

    picked = []
    for category, keywords in CATEGORY_KEYWORDS.items():
        mask = titles.str.contains(r"\b(" + "|".join(map(re.escape, keywords)) + r")\b", regex=True)
        matches = raw[mask]
        if matches.empty:
            raise ValueError(f"No LinkedIn postings matched {category}")
        sample = matches.sample(min(JOBS_PER_CATEGORY, len(matches)), random_state=SEED)
        for _, row in sample.iterrows():
            picked.append({
                "Category": category,
                "job_id": row["job_id"],
                "title": row["title"],
                "location": row["location"],
                "experience_level": row["formatted_experience_level"],
                "required_edu": required_education(row["description"]),
                "text": f"{row['title']}. {clean_text(row['description'])[:2000]}",
            })

    jobs = pd.DataFrame(picked)
    JOBS_CSV.parent.mkdir(parents=True, exist_ok=True)
    jobs.to_csv(JOBS_CSV, index=False)
    return jobs
