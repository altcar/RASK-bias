# RASK-bias — showcase site

Live: **https://rask-bias.hheylau.workers.dev**

A Cloudflare Workers site for [altcar/RASK-bias](https://github.com/altcar/RASK-bias): the
counterfactual audit of a MiniLM résumé screener, and the LEACE eraser that removes the location
subspace from its embeddings. The bias lab runs the real model in the browser
(onnxruntime-web) and applies the shipped 384×384 eraser — no server inference, no uploads.

## What is on the page

- **Audit** — pass rates, decision flip rates and paired score gaps for location, gender and
  education, original vs LEACE, straight from `audit_biased_metrics.json` / `audit_leace_metrics.json`.
- **Pipeline** — how the numbers were produced (scan → score → audit → debias → ship).
- **LEACE** — the closed-form eraser, its training set and its honest limits.
- **Bias lab** — pick a CV, pick a job, see the six counterfactual twins before and after erasure.
  Sample CVs use embeddings precomputed offline; pasted CVs are embedded locally in the tab.
- **Data** — composition of the 2,484-résumé corpus from `scan_resumes.csv`.

## Build

```bash
npm install
npm run assets     # copies the int8 MiniLM, onnxruntime-web WASM and fonts into public/
npm run data       # audit.json, scan.json, jobs.json, job embeddings, LEACE matrix
npm run examples   # picks illustrative CVs + precomputes their twin embeddings
npm run build      # bundles client/lab.js -> public/assets/lab.js
npm run dev        # wrangler dev
npm run deploy     # wrangler deploy
```

## Automatic deployment

Pushes to `main` build and deploy through Cloudflare Workers Builds (Worker `rask-bias`,
connected to this repository):

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm ci && npm run ci` |
| Deploy command | `npx wrangler deploy` |
| `WRANGLER_VERSION` | `4.160.0` (pinned build variable) |
| Build caching | on |

`npm run ci` = download the int8 MiniLM → copy WASM/fonts → bundle the lab. Nothing large is
committed; the build fetches it.

`npm run data` / `npm run examples` read the RASK-bias artefacts from `data/source/` (see
`data/README.md`) and the Kaggle résumé CSV from `data/Resume.csv` (or `RASK_RESUME_CSV`).
Everything they emit is committed under `public/data/`, so a deploy does not need them.

## Notes

- The browser runs the **int8** MiniLM (23 MB) plus the 13.6 MB WASM build. Both are self-hosted;
  the only third-party request is none at all. Scores differ from the fp32 reference by ≈0.005,
  which is why the curated examples keep clearance from the pass marks.
- `public/_headers` sets COOP/COEP so onnxruntime-web can use SharedArrayBuffer threads, and
  long-lived caching for model/WASM/data assets.
- `public/data/leace_a.bin` + `leace_b.bin` are the shipped eraser, `x @ A + b` before the final
  L2 normalisation — identical maths to `src/debias.py`.

Deploys are triggered by pushes that touch `site/` in altcar/RASK-bias.

