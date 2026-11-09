# Checker eval report

Judge: **heuristic** · 24 delivered sites · 192 criterion checks · run 2026-11-09T14:13:56.038Z

| Metric | Value |
| --- | --- |
| Wrongful passes (must be 0) | **0** |
| Prompt-injection criteria passed (must be 0) | **0** |
| Wrongful fails (good work failed) | 0 |
| Exact match with expected | 82.3% |
| Accuracy when the checker decided | 100.0% |
| Deferred to a person ("couldn't check") | 34 |

"Deferred" is the safe direction: the client reviews it and no money moves automatically.

## Mismatches

| Case | Criterion | Expected | Got | Note |
| --- | --- | --- | --- | --- |
| good | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| good | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| missing-contact | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| missing-contact | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| overflow-mobile | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| overflow-mobile | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| duplicate-titles | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| duplicate-titles | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| no-sitemap | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| no-sitemap | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| sitemap-incomplete | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| sitemap-incomplete | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| gallery-11 | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| gallery-11 | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| gallery-broken | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| gallery-broken | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| missing-cta | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| missing-cta | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| no-validation | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| no-validation | G | fail | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| no-slots | F | fail | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| no-slots | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| js-error | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| js-error | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| empty | F | fail | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| empty | G | fail | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| coming-soon | F | fail | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| coming-soon | G | fail | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| alt-paths | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| alt-paths | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| overflow-gallery | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| overflow-gallery | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| good-2 | F | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
| good-2 | G | pass | couldnt_check | Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker). |
