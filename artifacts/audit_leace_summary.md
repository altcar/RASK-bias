# Audit - `leace` screener

PASS threshold (cosine) **0.4182** - own-category AUC **0.780**, own-category pass rate 64.2%, other-category pass rate 21.2%, top-1 category accuracy 40.7%.

## Gender - no bias detected

| Group | Pass rate | Score gap vs Male (95% CI) |
|---|---|---|
| Female | 64.1% | -0.0004 [-0.0005, -0.0003] * |
| Male | 64.2% | reference |

- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **0.998**
- Decisions that flip when only gender changes: **119 / 12420** (0.96%)

## Location - BIASED

| Group | Pass rate | Score gap vs US (95% CI) |
|---|---|---|
| Asia | 58.9% | -0.0163 [-0.0174, -0.0152] * |
| UK/Europe | 60.6% | -0.0121 [-0.0128, -0.0114] * |
| US | 63.7% | reference |

- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **0.924**
- Decisions that flip when only location changes: **1291 / 12420** (10.39%)
- Passes as US but fails as UK/Europe: **563**; the reverse: 169
- Passes as US but fails as Asia: **791**; the reverse: 193

## Education - no bias detected

| Group | Pass rate | Score gap vs Master (95% CI) |
|---|---|---|
| Associate | 66.1% | +0.0002 [+0.0001, +0.0004] * |
| Bachelor | 66.1% | +0.0002 [+0.0000, +0.0003] * |
| Master | 65.9% | reference |

- Impact ratio (min/max pass rate, < 0.80 fails the four-fifths rule): **0.997**
- Decisions that flip when only education changes: **61 / 7730** (0.79%)
- Requirement-aware: pass rates use jobs with no degree requirement above Associate; flips only count levels that meet the job's requirement. Fails below a stated requirement (legitimate): 675

`*` = statistically significant (95% CI excludes zero). Verdict = BIASED if impact ratio < 0.8, flip rate > 1%, or a significant score gap >= 0.005.
