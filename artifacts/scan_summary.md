# Phase 1 - Data scan

Resumes: **2484** across **24** categories. Job postings sampled from LinkedIn (US only): **120**.

## Gender

| Signal | Resumes |
|---|---|
| None | 2236 (90.0%) |
| Male | 126 (5.1%) |
| Female | 122 (4.9%) |

Names are removed from the dataset, so gender is mostly invisible. The audit injects a gendered name + pronoun into otherwise identical resumes.

## Location

- Location masked as 'City, State': **95.1%**
- Resumes mentioning any country: **33.0%**

| Country mentioned | Resumes |
|---|---|
| US | 634 (25.5%) |
| India | 113 (4.5%) |
| UK | 79 (3.2%) |
| Canada | 50 (2.0%) |
| China | 48 (1.9%) |
| Germany | 28 (1.1%) |
| Nigeria | 14 (0.6%) |
| Philippines | 12 (0.5%) |
| Malaysia | 9 (0.4%) |

The audit fills the 'City, State' placeholders with a US, UK/Europe or Asia location and scores against US job postings.

## Education level (highest found)

| Level | Resumes |
|---|---|
| None | 255 (10.3%) |
| High school | 315 (12.7%) |
| Associate | 224 (9.0%) |
| Bachelor | 964 (38.8%) |
| Master | 684 (27.5%) |
| PhD | 42 (1.7%) |

### Job requirements (requirement-aware)

- Job postings stating a *required* degree: **25.0%** (the rest say none, 'preferred', or 'or equivalent experience')
- Resumes meeting the strictest requirement among their category's jobs: **75.2%**

| Required level | Postings |
|---|---|
| None | 90 |
| Associate | 3 |
| Bachelor | 26 |
| Master | 1 |

## Other protected-attribute cues

| Cue | Resumes containing it |
|---|---|
| race_ethnicity | 2.6% |
| age | 2.3% |
| marital_family | 17.4% |
| religion | 4.3% |
| nationality | 2.2% |
| disability_veteran | 5.6% |

## Education by category

| Category | None | High school | Associate | Bachelor | Master | PhD |
|---|---|---|---|---|---|---|
| ACCOUNTANT | 7% | 4% | 2% | 48% | 39% | 0% |
| ADVOCATE | 9% | 18% | 10% | 37% | 24% | 2% |
| AGRICULTURE | 6% | 6% | 5% | 38% | 37% | 8% |
| APPAREL | 11% | 18% | 14% | 42% | 14% | 0% |
| ARTS | 9% | 12% | 5% | 36% | 36% | 3% |
| AUTOMOBILE | 14% | 14% | 11% | 31% | 31% | 0% |
| AVIATION | 19% | 21% | 9% | 33% | 17% | 1% |
| BANKING | 9% | 13% | 5% | 41% | 31% | 1% |
| BPO | 18% | 0% | 0% | 55% | 27% | 0% |
| BUSINESS-DEVELOPMENT | 12% | 5% | 5% | 51% | 25% | 2% |
| CHEF | 8% | 22% | 37% | 25% | 8% | 0% |
| CONSTRUCTION | 11% | 29% | 9% | 30% | 20% | 1% |
| CONSULTANT | 10% | 8% | 4% | 33% | 41% | 3% |
| DESIGNER | 13% | 8% | 19% | 40% | 19% | 1% |
| DIGITAL-MEDIA | 16% | 3% | 2% | 55% | 24% | 0% |
| ENGINEERING | 13% | 12% | 8% | 30% | 32% | 5% |
| FINANCE | 6% | 7% | 5% | 46% | 35% | 2% |
| FITNESS | 10% | 13% | 9% | 43% | 25% | 1% |
| HEALTHCARE | 4% | 18% | 7% | 36% | 34% | 1% |
| HR | 13% | 4% | 7% | 35% | 41% | 1% |
| INFORMATION-TECHNOLOGY | 12% | 3% | 10% | 40% | 32% | 2% |
| PUBLIC-RELATIONS | 7% | 5% | 5% | 53% | 26% | 4% |
| SALES | 11% | 41% | 11% | 27% | 9% | 1% |
| TEACHER | 4% | 5% | 9% | 37% | 42% | 3% |
