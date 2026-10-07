# Audit - `biased` screener

PASS threshold (cosine) **0.4357** - own-category AUC **0.784**, own-category pass rate 64.7%, other-category pass rate 20.7%, top-1 category accuracy 41.8%.

## Gender - no bias detected

| Group | Pass rate | Score gap vs Male (95% CI) |
|---|---|---|
| Female | 64.5% | -0.0003 [-0.0004, -0.0002] * |
| Male | 64.4% | reference |

- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **0.999**
- Decisions that flip when only gender changes: **103 / 12420** (0.83%)

## Location - BIASED

| Group | Pass rate | Score gap vs US (95% CI) |
|---|---|---|
| Asia | 53.5% | -0.0310 [-0.0325, -0.0296] * |
| UK/Europe | 55.8% | -0.0263 [-0.0272, -0.0253] * |
| US | 63.1% | reference |

- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **0.848**
- Decisions that flip when only location changes: **1895 / 12420** (15.26%)
- Passes as US but fails as UK/Europe: **1028**; the reverse: 111
- Passes as US but fails as Asia: **1338**; the reverse: 148

## Education - no bias detected

| Group | Pass rate | Score gap vs Master (95% CI) |
|---|---|---|
| Associate | 66.0% | +0.0003 [+0.0001, +0.0004] * |
| Bachelor | 66.2% | +0.0002 [+0.0000, +0.0003] * |
| Master | 66.1% | reference |

- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **0.997**
- Decisions that flip when only education changes: **62 / 7730** (0.80%)
- Requirement-aware: pass rates use jobs with no degree requirement above Associate; flips only count levels that meet the job's requirement. Fails below a stated requirement (legitimate): 632

`*` = statistically significant (95% CI excludes zero). Verdict = BIASED if impact ratio < 0.8, flip rate > 1%, or a significant score gap >= 0.005.
