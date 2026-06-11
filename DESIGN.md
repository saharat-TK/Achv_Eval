---
name: Achv Evaluation App
description: Course evaluation & verification system for MFU School of Health Science — calm, trustworthy, Thai-first product UI.
colors:
  primary: "#00704A"
  accent: "#1E3932"
  canvas: "#F1F6F3"
  surface: "#FFFFFF"
  tint: "#E3F1EA"
  ink: "#0F172A"
  ink-muted: "#475569"
  ink-subtle: "#64748B"
  border: "#E2E8F0"
  border-strong: "#CBD5E1"
  danger: "#B91C1C"
  danger-bg: "#FEF2F2"
  warn: "#92400E"
  info: "#1E40AF"
  success: "#166534"
typography:
  headline:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  title:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  badge-status:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
---

# Design System: Achv Evaluation App

## 1. Overview

**Creative North Star: "The Quiet Registrar"**

This is the interface of a calm, exacting academic record-keeper. White cards float
on a mint-cream canvas; a single Starbucks-green voice marks the actions that matter;
every state is spelled out in plain Thai rather than left to color. Faculty open it a
few times a semester to do real, consequential work — uploading course documents,
scoring against the official 7-item rubric, signing off, generating signed PDF reports.
The interface earns trust by getting out of the way and being unambiguous about where
each course stands.

Density serves the task: tables run as tight as the data needs, panels carry many
labels, and an app-wide compact mode trims padding so more is visible without feeling
cramped. Familiarity is the goal, not novelty — standard nav, tables, forms, and the
occasional modal, executed cleanly. Nothing here should feel like a consumer app or a
heavyweight government portal.

This system explicitly rejects the cluttered legacy university portal (tiny gray-on-gray
tables, no hierarchy), playful consumer-SaaS decoration (blobs, gradients, mascots),
flashy marketing-landing energy (hero animation, oversized display type), and
over-decorated dashboards (gradient stat cards, neon charts, glassmorphism).

**Key Characteristics:**
- One green accent on neutral surfaces; restrained by default.
- White cards on a mint-cream page, separated by hairline borders, not shadow.
- Thai-first typography in a single family (Sarabun) at a fixed, compact rem scale.
- Status is always legible as text + color, never color alone.
- Deliberate, confirmable destructive actions (sign-off, regenerate, delete, reset).

## 2. Colors

A restrained institutional palette: two greens carry identity and action, a mint-cream
canvas carries the page, and a neutral slate ramp carries everything else.

### Primary
- **Starbucks Green** (#00704A): The single action + identity color — primary buttons,
  links, nav highlight, focused input borders, headings in generated PDFs. Used on a
  small share of any screen; its restraint is what makes it read as "the important thing."

### Secondary
- **House Green** (#1E3932): The deep companion green — accent underlines, dividers under
  section dividers, badge borders, and deep surfaces. Never competes with Primary for
  action meaning; it's structural and decorative-adjacent.
- **Light Green Tint** (#E3F1EA): Subtle highlight / "official" badge fill in reports and
  gentle emphasis surfaces.

### Neutral
- **Mint Cream** (#F1F6F3): The app page background. White cards on mint-cream is the core
  layering move — the page is never pure white.
- **Surface White** (#FFFFFF): Card and panel surfaces, table backgrounds, modal bodies.
- **Ink** (#0F172A, slate-900): Primary body text and headings.
- **Ink Muted** (#475569, slate-600): Secondary text, table cell values, descriptions.
- **Ink Subtle** (#64748B, slate-500): Labels, captions, meta. The floor for text on white.
- **Border** (#E2E8F0, slate-200): Card borders, table row dividers, the hairline that
  does the separating work shadow would do elsewhere.
- **Border Strong** (#CBD5E1, slate-300): Input/control borders, disabled-state borders.

### Status / Semantic
Status and rubric bands use Tailwind tonal pairs — a soft `-50/-100` fill with a strong
`-700/-800` text — as full pills, never as colored side-stripes:
- **Warning / "ปรับปรุง"** (text #92400E on amber-50/100): improve band, "needs attention" states.
- **Info / "ดี"** (text #1E40AF on blue-50/100): good band, in-progress/awaiting states.
- **Success / "ดีเยี่ยม"** (text #166534 on green-50/100): excellent band, completed/verified states.
- **Danger** (text #B91C1C on #FEF2F2 red-50): destructive actions and failures.
- **Violet** (violet-100 / text violet-800): mid-workflow "waiting on a person" offering states.
- **Neutral** (slate-100 / text slate-700): draft / inert states.

### Named Rules
**The One Green Rule.** Starbucks Green means "action or current selection." If it's not
clickable, selected, or a primary heading, it is not green. Decoration uses neutrals or
House Green, never the primary.

**The Label-Not-Color Rule.** Every status and band badge carries its Thai label as text.
Color reinforces meaning; it never carries meaning alone (color-blind + print safe).

**The AA Floor Rule.** Body and label text never go lighter than Ink Subtle (#64748B) on
white/mint. slate-400 and lighter are prohibited for text — they fail 4.5:1. Placeholders
included.

## 3. Typography

**Body / Display Font:** Sarabun (with `system-ui`, `sans-serif` fallback)
**Label/Mono Font:** Sarabun (one family throughout)

**Character:** One humanist Thai/Latin sans, multiple weights (300/400/600/700), carries
the entire UI — headings, buttons, labels, body, data. Sarabun is chosen for comfortable
Thai rendering: loops, tone marks, and long Thai labels stay legible at small sizes. No
second family; contrast comes from weight and size, not from pairing.

### Hierarchy
- **Headline** (600, 1.25rem / text-xl, lh 1.4): Page titles ("รายงานการทวนสอบ"). The top of
  the scale — product UI tops out here, no hero display type.
- **Title** (600, 1.125rem / text-lg, lh 1.4): Report/detail header titles, major section heads.
- **Body** (400, 0.875rem / text-sm, lh 1.5): Default UI text, table cells, descriptions.
  Cap prose at 65–75ch; dense tables may run wider.
- **Label** (500, 0.75rem / text-xs, lh 1.4): Field labels, badges, meta, table headers.

### Named Rules
**The No-Eyebrow Rule.** No tiny uppercase tracked kickers. Thai is caseless and the register
is a task tool, not a landing page — labels are sentence-case Thai at normal tracking.

**The Fixed-Scale Rule.** Sizes are fixed rem, never fluid `clamp()`. The same control must
look identical in a sidebar and a full-width page; users view at consistent DPI.

## 4. Elevation

Flat by default. Surfaces are separated by hairline `border-slate-200` borders on the
mint-cream canvas, not by resting shadow — a card at rest has a border and no shadow.
Shadow is reserved for genuinely lifted layers that escape the document flow: it signals
"this floats above the page," nothing more.

### Shadow Vocabulary
- **Panel float** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` — Tailwind `shadow-lg`): Dropdowns, popovers, the committee combobox list.
- **Modal lift** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` — Tailwind `shadow-xl`): Dialog/modal cards over the `bg-black/40` scrim.

### Named Rules
**The Flat-By-Default Rule.** If a surface sits in the page flow (card, table, panel), it
gets a border and no shadow. Shadow appears only on overlays (modals, dropdowns). A resting
drop-shadow on a content card is prohibited.

## 5. Components

Refined and restrained: quiet, precise controls with one green primary and neutral
everything-else. Familiar affordances, done cleanly.

### Buttons
- **Shape:** Gently rounded (8px, `rounded-lg`).
- **Primary:** Solid Starbucks Green (#00704A) with white text, `0.5rem 1rem` padding
  (`px-4 py-2`). For primary affirmative actions.
- **Hover / Focus:** Primary darkens slightly via `opacity-90` on hover; transitions ~150ms.
- **Outline / Secondary:** White surface, Starbucks-green text, 1px green border,
  `hover:bg-mfu-primary/5`. For secondary actions and "ดูรายงาน"-style links rendered as buttons.
- **Danger:** Light-red — `bg-red-50`, `text-red-700`, 1px `border-red-200`,
  `hover:bg-red-100`. For destructive/irreversible actions (create-overwrite, reset, delete).
- **Disabled:** `bg-slate-100`, `text-slate-400`, `border-slate-300`, `cursor-not-allowed`.
  Never a faded primary green.

### Chips / Badges
- **Style:** Full pill (`rounded-full`), `0.125rem 0.625rem` padding (`px-2.5 py-0.5`),
  `text-xs font-medium`. Tonal fill (`-50/-100`) + strong text (`-700/-800`); band badges
  add a matching 1px border.
- **State:** Status badges are read-only state indicators (offering status, rubric band),
  always paired with a Thai label.

### Cards / Containers
- **Corner Style:** 12px (`rounded-xl`; tightened to 8px under app-compact).
- **Background:** Surface White (#FFFFFF) on the Mint Cream page.
- **Shadow Strategy:** None at rest — see Elevation. Separation is the border.
- **Border:** 1px Border (#E2E8F0, slate-200).
- **Internal Padding:** `1.25rem` (`p-5`; `1rem` under app-compact).

### Inputs / Fields
- **Style:** White surface, 1px Border Strong (#CBD5E1, slate-300), 8px radius (`rounded-lg`),
  `0.5rem 0.75rem` padding. Native `date`/`time`/`select` controls are used as-is.
- **Focus:** Border shifts to Starbucks Green (`focus:border-mfu-primary`), no glow ring.
- **Error / Disabled:** Inline red helper text (#B91C1C) under the field; disabled controls
  drop to `opacity-50` or slate fill.
- **Combobox lists** escape container clipping with `position: fixed` + viewport-aware
  max-height (~10 rows, scroll), never an absolutely-positioned list inside an overflow box.

### Navigation
- **Style:** Top app bar in Starbucks Green with white workspace title; below it a white
  tab bar of text links.
- **Tabs:** `text-slate-600`, `border-b-2 border-transparent`; hover/active raises the green
  underline + green text (`hover:border-mfu-primary hover:text-mfu-primary`). Constrained to
  `max-w-[1026px]`.

## 6. Do's and Don'ts

### Do:
- **Do** keep Starbucks Green (#00704A) for actions, selection, and primary headings only —
  the One Green Rule. Carry decoration in neutrals or House Green.
- **Do** float white cards on the Mint Cream (#F1F6F3) page and separate them with 1px
  slate-200 borders; reserve shadow for modals and dropdowns.
- **Do** pair every status/band badge with its Thai label; color only reinforces it.
- **Do** keep body and label text at Ink Subtle (#64748B) or darker on white — verify 4.5:1.
- **Do** make destructive/irreversible actions deliberate: light-red styling plus a
  confirm step (type-to-confirm for create/delete).
- **Do** use one family (Sarabun) at a fixed rem scale; contrast via weight and size.

### Don't:
- **Don't** regress toward the **cluttered legacy university portal** — tiny gray-on-gray
  tables, no hierarchy, everything the same weight.
- **Don't** add **playful consumer-SaaS** decoration: blobs, mascots, emoji, gradient fills.
- **Don't** bring **flashy marketing-landing** energy: hero animation, oversized fluid
  display type, scroll choreography, or gradient text (`background-clip: text` is banned).
- **Don't** build **over-decorated dashboards**: gradient stat cards, neon charts, or
  glassmorphism. The data is the design.
- **Don't** use a colored `border-left`/`border-right` stripe as an accent on cards, list
  items, or alerts — use a full border or a tint fill.
- **Don't** put a resting drop-shadow on content cards, or use color alone to signal status.
- **Don't** use uppercase tracked eyebrow kickers above sections, or fluid `clamp()` heading sizes.
