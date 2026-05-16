# AI Evaluation Prompts

These markdown files are the **authoritative system prompt** sent to Gemini
when running course evaluation.

| File | Used when |
|------|-----------|
| `CLAUDE.master.md`    | `programs.level = 'master'` or `'doctoral'` (the original ป.โท พาราคลินิก guideline) |
| `CLAUDE.undergrad.md` | `programs.level = 'undergraduate'`            |

## Editing rules

1. These files are version-controlled with the app. When the curriculum
   committee updates the evaluation framework, edit here and submit a PR.
2. The parent directory of this repo also contains `CLAUDE.md` — that copy
   is for Claude Code's development context only and may drift. The files in
   this directory are what the production AI pipeline uses.
3. After editing, bump the date stamp at the bottom of each file so the
   pipeline can log which version produced each report.

## Loading at runtime

The `analyzeCourse` Cloud Function reads the file directly from this folder
(`functions/src/analyzeCourse.ts`), picking `CLAUDE.undergrad.md` when the
program's `level` is `undergraduate` and `CLAUDE.master.md` otherwise. The
file is sent to Gemini as the system instruction. Because these files ship
inside the `functions/` deploy bundle, they must stay in this directory.
