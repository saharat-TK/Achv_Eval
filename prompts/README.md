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

The AI pipeline loads these via `lib/gemini/load-prompt.ts` (to be added in
Phase 1) which picks the file based on the program's level enum.
