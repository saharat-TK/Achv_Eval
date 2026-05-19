# Theme — Starbucks Style

The visual theme is **token-driven**: every brand colour funnels through a
small set of Tailwind tokens in [`tailwind.config.ts`](../tailwind.config.ts)
plus the page background in [`app/globals.css`](../app/globals.css). The
generated report PDFs carry their own copy of these values in
[`functions/src/reportShared.ts`](../functions/src/reportShared.ts).

To re-theme the whole system, change the values in this file's tables, then
apply them to those three places. No component files reference raw hex.

## Palette

| Token | Hex | Role |
|-------|-----|------|
| Starbucks Green | `#00704A` | Primary — buttons, links, nav highlight, headings |
| House Green | `#1E3932` | Accent — underlines, badge borders, deep surfaces |
| Mint Cream | `#F1F6F3` | App page background |
| Light Green Tint | `#E3F1EA` | Subtle badge / highlight fills |
| Slate 900 | `#0f172a` | Body text (unchanged neutral) |
| White | `#FFFFFF` | Card surfaces (unchanged) |

## Tailwind tokens (`tailwind.config.ts`)

| Token | Value | Was |
|-------|-------|-----|
| `mfu.primary` | `#00704A` | `#7c1f2e` (MFU maroon) |
| `mfu.accent` | `#1E3932` | `#f0b323` (MFU gold) |

The token *names* are kept as `mfu.*` so no component markup changes — only
the values move. ~29 components use `mfu-primary` and re-theme automatically.

## App surface (`app/globals.css`)

| Element | Value | Was |
|---------|-------|-----|
| `body` background | `#F1F6F3` (Mint Cream) | `bg-slate-50` |
| `body` text | `text-slate-900` | unchanged |

Card surfaces stay `bg-white` — white cards on a mint-cream page is the
Starbucks layering.

## Report PDF (`functions/src/reportShared.ts` → `REPORT_STYLES`)

| Element | Value | Was |
|---------|-------|-----|
| `h1`, `h2` colour | `#00704A` | `#7c1f2e` |
| `h2` / `.cover` underline | `#1E3932` | `#f0b323` / `#7c1f2e` |
| `.official` badge fill / border | `#E3F1EA` / `#00704A` | `#fffbeb` / `#f0b323` |

A functions redeploy is required for PDF changes to take effect.
