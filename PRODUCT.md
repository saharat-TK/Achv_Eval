# Product

## Register

product

## Users

Faculty and staff of the School of Health Science, Mae Fah Luang University (MFU),
working in Thai. Four roles, each in a distinct task context:

- **Lecturers** (per course offering) — upload TQF documents (มคอ.3/5, grade reports)
  for their courses each semester. Often non-technical; they want to submit the right
  files and see that analysis is underway.
- **Assessors** — score each offering against the official 7-item rubric and sign off.
  Focused, repetitive evaluation work; accuracy and clarity matter.
- **Program directors** — track per-program verification progress and produce semester /
  annual summary reports for their academic program(s).
- **Admins / super-admins** — manage departments, programs, offerings, users/roles, and
  school-wide reporting; oversee the whole evaluation cycle.

Primarily desktop, in an office/meeting context. Users range from comfortable-with-software
to occasional users who open the tool a few times a semester.

## Product Purpose

A Course Evaluation & Monitoring System ("ระบบประเมินและทวนสอบรายวิชา") that runs the
per-semester achievement-verification (ทวนสอบผลสัมฤทธิ์) workflow: lecturers upload course
documents → Gemini analyzes them → assessors score with the official 7-item rubric and
sign off → a verification committee reviews and produces signed PDF reports. Success is
the cycle completing accurately and on time, with trustworthy official records (per-course
and summary report PDFs) and clear visibility of where every course stands.

## Brand Personality

**Calm, trustworthy, efficient.** Quiet institutional confidence — the interface gets out
of the way so faculty trust the data and move through their task. Voice is plain, precise,
and Thai-first; supportive without being chatty. It should feel like a dependable academic
instrument, not a consumer app and not a heavyweight government portal.

## Anti-references

- **Cluttered legacy gov/university portals** — dense menus, tiny gray-on-gray tables, no
  hierarchy. The thing this replaces; never regress toward it.
- **Playful consumer SaaS** — cartoon illustrations, blobs, gradients, emoji, mascots.
  Too casual for official evaluation records.
- **Flashy marketing landing pages** — hero animations, oversized display type, scroll
  choreography, gradient text. Wrong register for a task tool.
- **Over-decorated dashboards** — gradient stat cards, neon charts, glassmorphism, and
  decoration that competes with the data.

## Design Principles

- **The tool disappears into the task.** Earned familiarity over novelty; standard
  affordances (nav, tables, forms, modals used sparingly) done well. No invented controls.
- **Trust the record.** This system produces official academic documents — clarity,
  accuracy, and auditability beat visual flair. Destructive or irreversible actions
  (sign-off, report generation/regeneration, deletion, role/lock changes) are deliberate
  and confirmable.
- **Built for non-technical, Thai-reading faculty.** Guide, don't assume: obvious next
  steps, legible Thai, plain labels, and states explained in words.
- **Status is always legible.** Every offering and report state (รอทวนสอบ / ทวนสอบแล้ว,
  ปรับปรุง / ดี / ดีเยี่ยม, synthesizing / ready, etc.) reads unambiguously as text, not
  by color alone.
- **Restrained by default.** One green accent for primary actions, selection, and state;
  neutral surfaces carry the structure. Density where the work needs it, calm everywhere else.

## Accessibility & Inclusion

- **WCAG AA contrast** — body text ≥4.5:1, large/UI text ≥3:1, including muted slate text,
  placeholders, and the status/band badges currently in use.
- **Thai readability** — Sarabun tuned for comfortable Thai line-height and size; long Thai
  labels and report text remain easy to read, including for older faculty.
- **Reduced motion** — honor `prefers-reduced-motion` everywhere; motion conveys state
  (loading, feedback, reveal), never decoration.
- Status indicators already pair color with a text label; keep that pairing so meaning never
  depends on color alone.
