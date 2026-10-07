"""Protected / sensitive attributes: gender, location, education level.

- Gender and location are (almost always) masked in the Kaggle resumes, so the audit
  *injects* them counterfactually: the same resume is scored as female vs male, and as
  US vs UK/Europe vs Asia based.
- Education level is real data, so it is *extracted* from the resume, and the degree
  requirement is extracted from the job description (requirement-aware fairness).

Every injectable list is split in half: even indexes are "fit" values (allowed to be used
when building a debiasing layer), odd indexes are held-out "audit" values.
"""
import re

# --- Gender -------------------------------------------------------------------------------
# F/M pairs drawn from several ethnic backgrounds so gender is not confounded with race.
# Each pair shares a surname so only the first name (the gender signal) differs.
GENDER_PAIRS = [
    ("Emily", "Greg", "Walsh"),
    ("Sarah", "Matthew", "Olson"),
    ("Lakisha", "Jamal", "Washington"),
    ("Aisha", "Darnell", "Jefferson"),
    ("Maria", "Jose", "Hernandez"),
    ("Lucia", "Carlos", "Garcia"),
    ("Mei", "Wei", "Chen"),
    ("Priya", "Rajesh", "Patel"),
    ("Anne", "Brad", "Becker"),
    ("Yuki", "Hiroshi", "Tanaka"),
]
GENDERS = ["Female", "Male"]
PRONOUNS = {"Female": ("She", "her"), "Male": ("He", "his")}

# --- Location -----------------------------------------------------------------------------
LOCATIONS = {
    "US": ["Austin, TX, USA", "Chicago, IL, USA", "Seattle, WA, USA",
           "Atlanta, GA, USA", "Boston, MA, USA", "Denver, CO, USA"],
    "UK/Europe": ["London, UK", "Berlin, Germany", "Manchester, UK",
                  "Paris, France", "Amsterdam, Netherlands", "Madrid, Spain"],
    "Asia": ["Kuala Lumpur, Malaysia", "Bangalore, India", "Singapore",
             "Manila, Philippines", "Shanghai, China", "Ho Chi Minh City, Vietnam"],
}
REGIONS = list(LOCATIONS)
LOCATION_PLACEHOLDER = re.compile(r"\bCity\s*,\s*State\b")

# Countries/regions we can spot in free text (for scanning real resumes and JDs).
COUNTRY_PATTERNS = {
    "US": r"\b(USA|U\.S\.A?\.?|United States)\b",
    "India": r"\bIndia\b",
    "UK": r"\b(United Kingdom|UK|England|London)\b",
    "Canada": r"\bCanada\b",
    "Malaysia": r"\bMalaysia\b",
    "Philippines": r"\bPhilippines\b",
    "China": r"\bChina\b",
    "Germany": r"\bGermany\b",
    "Nigeria": r"\bNigeria\b",
}

# --- Education ----------------------------------------------------------------------------
EDU_LEVELS = ["None", "High school", "Associate", "Bachelor", "Master", "PhD"]
EDU_PATTERNS = [  # (level index, pattern), checked highest first
    (5, re.compile(r"\b(Ph\.?\s?D|Doctor of Philosophy|Doctorate|Ed\.D)\b", re.I)),
    (4, re.compile(r"\b(Master'?s?\b|Master of|M\.\s?[AS]\b|MBA|M\.?Sc|M\.Ed|M\.Tech)", re.I)),
    (3, re.compile(r"\b(Bachelor'?s?\b|Bachelor of|B\.\s?[AS]\b|B\.?Sc|B\.Tech|B\.E\.|B\.Com|BBA|BS in|BA in)")),
    (2, re.compile(r"\b(Associate'?s? (of|in|degree)|Associates? Degree|A\.A\.S?\.|A\.S\. degree)", re.I)),
    (1, re.compile(r"\b(High School Diploma|GED|Diploma)\b", re.I)),
]
# JDs use "master" as a verb/adjective ("master the skills"), so require degree wording there.
JD_EDU_PATTERNS = [
    (5, re.compile(r"\b(Ph\.?\s?D|Doctorate|Doctoral degree)\b")),
    (4, re.compile(r"\b(Master'?s'? degree|Masters degree|Master of|MBA|M\.S\.|M\.A\.|graduate degree)", re.I)),
    (3, re.compile(r"\b(Bachelor'?s?|Bachelor of|B\.S\.|B\.A\.|four[- ]year degree|4[- ]year degree|undergraduate degree)", re.I)),
    (2, re.compile(r"\b(Associate'?s? degree|Associates? degree|two[- ]year degree|2[- ]year degree)", re.I)),
]
PREFERRED = re.compile(r"\b(prefer\w*|plus|nice to have|a bonus|desired|ideally|may be)\b", re.I)
EQUIVALENT = re.compile(r"\bor (equivalent|comparable|related) (work |professional )?experience\b|\bor \d+\+? years", re.I)


def _split(values, part):
    return values[0::2] if part == "fit" else values[1::2]


def gender_names(part="audit"):
    """[(female_first, male_first, surname), ...] for the given split."""
    return _split(GENDER_PAIRS, part)


def locations(region, part="audit"):
    return _split(LOCATIONS[region], part)


def education_level(text):
    """Highest education level mentioned in a resume (index into EDU_LEVELS)."""
    section = _education_section(text)
    for level, pat in EDU_PATTERNS:
        if pat.search(section):
            return level
    return 0


def _education_section(text):
    """Text after the Education heading if there is one (avoids 'Master Chef' etc.)."""
    m = re.search(r"\bEducation( and Training| & Training)?\b", text)
    return text[m.start():] if m else text


def required_education(jd_text):
    """Minimum *required* degree level stated in a JD, or 0 if none / only preferred.

    A level counts as required if it appears in a sentence that does not mark it as
    preferred and does not allow equivalent experience instead.
    """
    required = []
    for sentence in re.split(r"(?<=[.;\n•])\s+", jd_text):
        if PREFERRED.search(sentence) or EQUIVALENT.search(sentence):
            continue
        # Alternatives in one sentence ("bachelor's, master's or PhD") -> the lowest one.
        levels = [level for level, pat in JD_EDU_PATTERNS if pat.search(sentence)]
        if levels:
            required.append(min(levels))
    return min(required) if required else 0


def countries_mentioned(text):
    return [c for c, p in COUNTRY_PATTERNS.items() if re.search(p, text)]


# --- Counterfactual injection -------------------------------------------------------------
def with_identity(text, first=None, last=None, gender=None, location=None):
    """Return the resume with a name/pronoun header and a location filled in.

    The location replaces the dataset's 'City, State' placeholders (so every job entry
    reads as being in that place) and is added to the header like a real CV address line.
    """
    header = []
    if first:
        header.append(f"{first} {last}")
        header.append(f"{first.lower()}.{last.lower()}@email.com")
    if location:
        header.append(location)
        text = LOCATION_PLACEHOLDER.sub(location, text)
    if gender:
        subj, poss = PRONOUNS[gender]
        header.append(f"{subj} brings {poss} experience to this role.")
    return ("\n".join(header) + "\n\n" + text) if header else text


# Degree rewrites for the education counterfactual: (pattern, {level: replacement}).
# Only Associate (2) / Bachelor (3) / Master (4) are swapped; they share phrasing.
_DEGREE_SWAPS = [
    (re.compile(r"\b(Master|Bachelor|Associate)(?:'s|s|s')?(?=\s+of\b)", re.I),
     {4: "Master", 3: "Bachelor", 2: "Associate"}),
    (re.compile(r"\b(Master|Bachelor|Associate)(?:'s|s|s')?(?=\s+degree\b)", re.I),
     {4: "Master's", 3: "Bachelor's", 2: "Associate's"}),
    (re.compile(r"\b(Masters|Bachelors|Associates)\b"), {4: "Masters", 3: "Bachelors", 2: "Associates"}),
    (re.compile(r"\b[MBA]\.\s?([AS])\b\.?"), {4: r"M.\1.", 3: r"B.\1.", 2: r"A.\1."}),
    (re.compile(r"\b(MBA|BBA)\b"), {4: "MBA", 3: "BBA", 2: "Associate of Business Administration"}),
    (re.compile(r"\b(MS|BS|AS|MA|BA) in\b"), {4: "MS in", 3: "BS in", 2: "AS in"}),
    (re.compile(r"\b[MB]\.?Sc\b"), {4: "MSc", 3: "BSc", 2: "Associate of Science"}),
]


def set_education(text, level):
    """Rewrite every Associate/Bachelor/Master mention in the Education section to `level`.

    Returns None if the resume has no swappable degree or holds a PhD (left untouched),
    so the caller can skip it.
    """
    if education_level(text) not in (2, 3, 4):
        return None
    m = re.search(r"\bEducation( and Training| & Training)?\b", text)
    if not m:
        return None
    head, section = text[:m.start()], text[m.start():]
    for pat, repl in _DEGREE_SWAPS:
        section = pat.sub(repl[level], section)
    out = head + section
    return out if education_level(out) == level else None
