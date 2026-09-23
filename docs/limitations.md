# LingoQuest — Reporting Rules & Limitations

## What This Test Covers

LingoQuest is a static, browser-based multiple-choice test of English grammar,
vocabulary, and short reading comprehension. It uses a 2PL IRT / EAP adaptive
engine for item selection and provisional theta estimation, but **the reported
level is determined by direct per-level evidence**, not by the theta estimate
alone.

## Reporting Rules (Product Rules, Not Psychometric Standards)

### Evidence Requirements per Level

| Rule | Value |
|------|-------|
| Minimum attempts to consider a level "supported" | 2 items |
| Minimum accuracy to consider a level "supported" | 50 % |
| C1 exposure gate | ≥ 2 C1 items must be answered |
| C2 exposure gate | ≥ 2 C2 items must be answered |

### How the Reported Level Is Determined

1. For each CEFR level (A1–C2), count items attempted and items correct.
2. A level is **supported** if: `attempts >= 2` AND `correct/attempts >= 0.5`.
3. The **highest supported level** becomes the reported level, subject to
   the C1/C2 gates.
4. **C1 gate**: If the candidate level is C1 (index 4) but fewer than 2 items
   at C1 were answered, C1 cannot be reported. The highest supported level
   below C1 is used instead.
5. **C2 gate**: C2 requires two C2 attempts with at least 50% correct **and**
   two C1 attempts with at least 50% correct. If C1 is not supported, C2 cannot
   be reported even if every C2 answer was correct.
6. **Inconclusive**: If no level meets both the attempt and accuracy criteria,
   the result is **inconclusive** (return -1). The test will never infer a
   level from mere theta or from attempt counts alone when accuracy is below
   threshold.

### Why Theta Alone Is Not Used for Reporting

The theta estimate and its mapping to CEFR levels use:
- **Heuristic item difficulties** mapped from question id prefix (a1–c2),
  not empirically calibrated parameters.
- **Default theta bounds** [-1.8, -0.9, 0, 0.9, 1.8] for A1–C2, which are
  plausible defaults, not validated CEFR cut scores.

A high theta estimate from B2 items alone does **not** imply C1 proficiency,
because no C1-level content has been attempted. Even with a high theta, the
reported level will not exceed B2 unless C1 items have been answered with
sufficient accuracy.

### Stopping Rules

The test stops when any of these conditions is met:
1. **Hard cap**: 40 questions answered — always stops.
2. **Bank exhaustion**: No unused questions remain — always stops, even before
   the minimum count.
3. **Candidate-level probing**: If theta suggests an unsupported band, the
   test asks unused items at that band. For a C2 candidate it probes C1 first
   when qualifying C1 evidence is missing. If the required item pool runs out,
   it stops with a limited-evidence reason instead of claiming precision.
4. **Internal heuristic**: After at least 10 questions, a theta standard
   error below 0.45 can stop the test only when the candidate band meets the
   exposure and accuracy rules (and C2's C1 prerequisite does too). It is not
   a calibrated confidence interval or learner-facing precision claim.

The stop reason displayed to learners is a plain description (e.g., "Sufficient
responses collected."), not a numeric precision value. Results are built once by
`buildResultData()` in `js/engine.js`; `renderPromptJSON()` uses it for the
same JSON that copy and download consume.

## What This Test Cannot Do

This test is limited to multiple-choice grammar, vocabulary, and reading items.
It explicitly cannot assess:

- **Listening comprehension**
- **Speaking ability** (pronunciation, fluency, interaction)
- **Writing proficiency** (the optional essay is collected but not scored)
- **Real-world communicative competence**

The reported level reflects performance on this specific question bank only and
is **not a certified CEFR assessment**. Any use of these results for academic,
professional, or immigration purposes would be inappropriate without empirical
validation against representative test-taker data.

## Known Item Limitations

- Item difficulties are heuristic mappings, not empirically calibrated.
- Some items may have ambiguous or multiple defensible answers:
  - `b2-21` originally used "The data ___ collected..." where both "was" and
    "were" are defensible in modern usage. Changed to "The individual data
    points ___ collected over six months last year" for plural past agreement.
  - `c1-4` originally "Without funding the project ___" lacked time context
    allowing both "would fail" and "would have failed". Added time reference
    to disambiguate.
  - `c2-1` originally "Without her, it ___ catastrophic" — same issue. Added
    context to make past hypothetical unambiguous.
  - `b2-26` originally had both "gift" and "talent" as valid answers for
    "a ___ for learning languages". It now uses "a natural ___" with "talent"
    keyed and no "gift" or "skill" distractor.
- The question bank is small and not representative of full CEFR content
  coverage.

## Software Validation vs. Psychometric Validation

### Software Validation (covered by tests)

- Selection never repeats a question ID.
- Bank exhaustion returns null or triggers stop.
- `computeReportedLevel()` returns correct levels given per-level stats,
  returns -1 when no level meets criteria (all wrong, insufficient attempts,
  etc.).
- `shouldStop()` makes correct decisions based on cap, exhaustion, and
  candidate-level probing requirements.
- The 11-item B1/B2-only scenario correctly caps at B2 (does not report C1).
- All-wrong answers produce inconclusive results.

### Psychometric Validation (not covered by this repository)

- Item difficulty calibration with representative test-taker data.
- CEFR cut score validation (standard-setting study).
- Test-retest reliability.
- Convergent validity against established proficiency tests.
- Differential item functioning analysis.
- Any claim of scientifically calibrated CEFR skill levels.

## Operational Thresholds

The thresholds defined in `js/engine.js` are product rules chosen for
conservative behavior, not psychometric facts:

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `MIN_QS` | 10 | Minimum questions before SE-based stopping |
| `MAX_QS` | 40 | Hard question cap |
| `THETA_SE` | 0.45 | SE threshold for stopping (internal heuristic) |
| `MIN_ATTEMPTS_DEMONSTRATED` | 2 | Minimum per-level attempts |
| `MIN_ADVANCED_EXPOSURE` | 2 | Minimum C1/C2 exposure |
| `MIN_ACCURACY` | 0.5 | Minimum per-level accuracy |

These values were chosen to prevent unjustified advanced-level claims with
very limited data. They are not based on empirical research and should be
adjusted if formal validation is conducted.