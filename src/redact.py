"""Detect and remove names and other protected-attribute cues from resume text.

Name detection is structural (header position and shape), not a lookup against the
name lists in names.py, so it works on names the system has never seen.
"""
import re

# Words that make a header line a job title rather than a person's name.
JOB_WORDS = {
    "manager", "engineer", "senior", "junior", "assistant", "director", "specialist", "analyst",
    "accountant", "consultant", "designer", "developer", "teacher", "chef", "cook", "officer",
    "associate", "administrator", "coordinator", "executive", "representative", "technician",
    "supervisor", "lead", "intern", "nurse", "sales", "marketing", "resume", "curriculum", "vitae",
    "professional", "summary", "profile", "objective", "experience", "advocate", "attorney",
    "president", "vice", "head", "chief", "agent", "clerk", "trainer", "instructor", "pilot",
    "owner", "partner", "member", "staff", "general", "operations", "account", "business",
}

NAME_TOKEN = re.compile(r"^[A-Za-z][A-Za-z'\-.]*$")
NAME_PREFIX = re.compile(r"^\s*(full\s+)?name\s*[:\-]\s*", re.I)

CONTACT_PATTERNS = [
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"),                          # email
    re.compile(r"(\+\d[\d\s().-]{7,}\d|\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b)"),  # phone
    re.compile(r"(https?://\S+|www\.\S+|linkedin\.com/\S+)", re.I),  # urls / profiles
    re.compile(r"\b(e-?mail|phone|tel|mobile)\s*:\s*", re.I),        # dangling labels
]

# Protected-attribute cues beyond the name. Each maps a label (used by scan.py) to a pattern.
CUE_PATTERNS = {
    "race_ethnicity": re.compile(
        r"\b(African[- ]American|Black (?:Student|Engineers|Professionals|Women|Men)\w*|Hispanic|Latin[oax]|"
        r"Asian(?:[- ]American)?|Native American|Caucasian|Chicano|Pacific Islander)\b"
    ),
    "gender": re.compile(r"\b(he|she|him|his|hers|herself|himself|Mr\.|Mrs\.|Ms\.|Miss)\b", re.I),
    "age": re.compile(r"\b(date of birth|D\.?O\.?B\.?|born (?:on|in)|age\s*:\s*\d+|\d{2} years old)\b", re.I),
    "marital_family": re.compile(r"\b(married|single|divorced|widowed|marital status|children)\b", re.I),
    "religion": re.compile(r"\b(church|christian|muslim|islamic|jewish|hindu|buddhist|mosque|synagogue)\b", re.I),
    "nationality": re.compile(r"\b(nationality|citizenship|visa status|green card|place of birth)\b", re.I),
    "disability_veteran": re.compile(r"\b(disabilit\w*|veteran|wheelchair)\b", re.I),
}


def _looks_like_name(line):
    line = NAME_PREFIX.sub("", line).strip()
    tokens = line.split()
    if not 2 <= len(tokens) <= 4:
        return None
    if not all(NAME_TOKEN.match(t) for t in tokens):
        return None
    if any(t.lower().strip(".") in JOB_WORDS for t in tokens):
        return None
    if not all(t[0].isupper() for t in tokens):
        return None
    return tokens


def _find_name(text):
    """Return (line_index, name_tokens) for the header line holding the name, or (None, [])."""
    for i, line in enumerate(text.splitlines()[:3]):
        if not line.strip():
            continue
        tokens = _looks_like_name(line)
        if tokens:
            return i, tokens
    return None, []


def detect_name(text):
    """Return the name tokens from the resume header, or [] if none found."""
    return _find_name(text)[1]


def strip_name(text, name_tokens=None):
    """Remove the name header line, contact details, and any other full-name mentions.

    Only the full name is removed from the body: deleting single tokens would also delete
    real content for names that are ordinary words (e.g. Banks, Baker, Kenya).
    """
    line_idx, detected = _find_name(text)
    tokens = name_tokens if name_tokens is not None else detected
    if line_idx is not None and name_tokens is None:
        lines = text.splitlines()
        text = "\n".join(lines[:line_idx] + lines[line_idx + 1:])
    for pat in CONTACT_PATTERNS:
        text = pat.sub(" ", text)
    if tokens:
        full = r"\s+".join(map(re.escape, tokens))
        text = re.sub(rf"\b{full}\b", " ", text, flags=re.I)
    text = NAME_PREFIX.sub("", text)
    text = re.sub(r"(?m)^[\s|,;:/-]+$", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def redact(text, name_tokens=None):
    """Full blind-screening redaction: name, contact details and protected-attribute cues."""
    text = strip_name(text, name_tokens)
    for pat in CUE_PATTERNS.values():
        text = pat.sub("[REDACTED]", text)
    return text
