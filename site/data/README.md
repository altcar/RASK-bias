# Source data

Small artefacts copied from [altcar/RASK-bias](https://github.com/altcar/RASK-bias) →
`artifacts/`, because the site build needs them:

| File | Origin |
|---|---|
| `jobs.csv` | `artifacts/jobs.csv` — the 120 sampled US LinkedIn postings |
| `scan_resumes.csv` | `artifacts/scan_resumes.csv` — per-résumé attribute scan |
| `audit_biased_metrics.json` | `artifacts/audit_biased_metrics.json` |
| `audit_leace_metrics.json` | `artifacts/audit_leace_metrics.json` |
| `calibration.json` | `artifacts/calibration.json` |
| `leace_A.npy`, `leace_B.npy` | the two arrays inside `artifacts/leace.npz` |

`Resume.csv` (the Kaggle `Resume` dataset, ~54 MB) is **not** vendored. Put it here as
`data/Resume.csv`, or point `RASK_RESUME_CSV` at your copy, before running `npm run examples`.
