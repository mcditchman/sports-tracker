# Design System — inspired by pirsch.io

Reference for visual design decisions in sports-tracker, derived by inspecting pirsch.io
(a privacy-focused analytics dashboard). Chosen because the product shape is close to
ours: a dark, data-dense dashboard with filter chips, stat tiles, and a bar chart —
which is exactly the shape of the trend dashboard at `/`. This is a reference doc, not
an implementation — treat token values as a starting point to adapt, not copy verbatim.

## Why this reference

pirsch.io's marketing site sells an analytics product by showing the product itself:
a dark dashboard with unique-visitor stat tiles, a comparison bar chart (this period
vs. previous period, in two shades of green), and one-click filter chips
(`Country is Germany ×`). Our trend dashboard does the same job — team/stat filters,
a chart, a summary — so its component patterns transfer directly instead of needing
translation from a generic marketing template.

## Color

Dark-first palette. Background is near-black, not pure black, with a single mint-green
accent doing double duty as brand color and "positive/highlight" data color.

| Token | Hex / value | Use |
|---|---|---|
| `--color-bg` | `#0a0a0a` | Page background |
| `--color-bg-elevated` | `rgba(255,255,255,0.04)` | Card / panel fill (flat, not gradient) |
| `--color-bg-glass` | `rgba(10,10,10,0.4)` + `backdrop-filter: blur(24px)` | Sticky header / overlay panels |
| `--color-border` | `rgba(255,255,255,0.08)` | Hairline card borders (subtle, not `#333`-style gray) |
| `--color-text-primary` | `#ffffff` | Headings, primary values |
| `--color-text-secondary` | `#adadad` | Body copy, labels, secondary stat deltas |
| `--color-accent` (mint) | `#6ece9d` | Primary CTA, positive deltas, active filter chips, chart "current period" bars |
| `--color-accent-alt` (amber) | `#ffda6e` | Secondary emphasis — "featured" badges, second data series |
| `--color-negative` | `#e87b7b` | Negative deltas / destructive actions only |
| `--color-orange` | `#f7a66b` | Tertiary chart series if a third comparison is needed |

Rules:
- One accent color carries the whole page (mint). Amber and red are used sparingly and
  only for their specific meaning (featured/warning, negative), never decoratively.
- Cards never get a solid fill — always `rgba(255,255,255,0.04)` over the page background,
  which is what makes the "glass panel" look read as layered rather than boxed.
- No pure black (`#000`) as a surface color; `#0a0a0a` avoids the harsh-OLED look.

Light mode: pirsch.io is dark-only, so there's no reference to lift for light mode.
sports-tracker's current `globals.css` already has a `prefers-color-scheme: dark` split —
keep that structure, but treat dark as the primary/designed-for mode and let light mode
be a straightforward inversion (white bg, same mint accent at a slightly deeper shade
for contrast, e.g. `#3fa877`) rather than a separately designed theme.

## Typography

- Typeface: **DM Sans** (Google Font) for everything — headings, body, UI. One family,
  differentiated by weight and size rather than pairing a display face with a body face.
  Weight 500 for headings (not 700/bold — this is what gives pirsch's type its
  slightly-softer, confident-but-not-shouty feel), 400 for body copy.
- sports-tracker currently ships Geist (`--font-geist-sans` in `globals.css`). Swapping
  to DM Sans means adding it via `next/font/google` and updating the `@theme inline`
  block's `--font-sans` — a deliberate call to make, not a silent swap.

| Role | Size / line-height | Weight | Letter-spacing |
|---|---|---|---|
| Hero / page H1 | 96px / 120px | 500 | normal |
| Section H2 | 64px / 80px | 500 | -1px |
| Card heading (H3) | ~24px / 32px | 500 | normal |
| Body | 18px / 27px | 400 | normal |
| Stat value (big number) | ~32–36px / 1.1 | 500–700 | normal |
| Label / eyebrow / caption | 12–13px, uppercase | 600–700 | ~1px tracking |

For our dashboard, the "hero" and "section H2" sizes are oversized for a data app —
scale those down (e.g. page title ~32px, section headers ~20px) but keep the same
weight relationships: 500-weight headings, 400-weight body, secondary text in
`--color-text-secondary` rather than a lighter font-weight.

## Spacing & radius

Token-based, not ad hoc — pirsch defines a small fixed scale and reuses it everywhere:

| Token | Value |
|---|---|
| `--space-xs` | 16px |
| `--space-sm` | 32px |
| `--space-md` | 64px |
| `--space-lg` | 128px |
| `--space-xl` | 192px |
| `--radius-sm` | 6px (chips, small buttons) |
| `--radius-md` | 12px |
| `--radius-lg` | 24px (cards, panels) |

Cards use the large radius (24px) consistently — it's a recognizable signature of the
site, not incidental. Buttons and filter chips use the small radius (6px), giving a
clear visual hierarchy between "container" and "control."

## Components (patterns worth reusing)

**Stat tiles** — the pirsch dashboard header row (`Unique Visitors 23.9k ▲22.3%`) is
directly analogous to our trend summary. Pattern: big number (500–700 weight) with a
small muted label above it and a small colored delta badge beside/below it (green for
up, red for down). Group 3–5 stat tiles in a single row with hairline dividers, not
individual boxed cards — reserve card treatment for content that needs a visual
boundary (charts, tables).

**Filter chips** — pirsch's `Country is Germany ×` / `Browser is not Firefox ×` chips
are a strong direct match for our league/team/stat/window/venue/opponent filters.
Each active filter renders as a pill: mint-tinted background, small `×` to remove,
6px radius, sits inline in a search-bar-like container. This is a better pattern for
our filter row than plain `<select>` dropdowns once filters compose (e.g. "team X, for,
last 5, home").

**Bar chart** — two-tone comparison bars (solid fill for current period, outline-only
for previous period, both in shades of the accent green) rather than two different
hues. Grid lines are barely-there (very low-opacity white), axis labels use
`--color-text-secondary` at a small size. This maps well to our "trend over matches"
chart if we ever add a comparison window.

**Cards / feature panels** — `rgba(255,255,255,0.04)` fill, 24px radius, 48px padding,
`backdrop-filter: blur(24px)`, no visible border or box-shadow — the elevation reads
entirely from the fill + blur, not from a shadow. Good for the dashboard's chart
container and summary panel.

**Buttons**
- Primary: mint fill (`#6ece9d`), dark text, 6px radius, medium weight label — used for
  the one primary action on a view.
- Secondary/featured: amber fill, same shape — reserve for a single "recommended"
  choice among options (pirsch uses it for the "Best Value" pricing tier).
- Tertiary: transparent/gray fill, used for lower-emphasis or disabled-reading actions.

**Numbered/eyebrow markers** (`1 · EASY START`) — only appropriate where order is
real information (an actual sequence of steps). Our dashboard has no such sequence,
so skip this pattern rather than importing it for decoration.

## Motion

pirsch uses scroll-triggered fade/slide-in for marketing sections and no ambient
animation once content is visible — restrained, one-shot reveals rather than
continuous motion. For a dashboard (not a marketing page), the useful takeaway is
narrower: transition filter/chart state changes (chip add/remove, chart data swap)
with a short fade, not a page-load animation sequence. Respect
`prefers-reduced-motion`.

## Applying this to sports-tracker

Concretely, if adopted:
1. Add DM Sans via `next/font/google`, replace `--font-geist-sans` in
   `src/app/globals.css`'s `@theme inline` block.
2. Extend `:root` / the dark-mode block in `globals.css` with the color tokens above
   (`--color-bg`, `--color-bg-elevated`, `--color-accent`, etc.) instead of the current
   two-variable `--background`/`--foreground` setup.
3. Rebuild the trend dashboard's filter controls as chips instead of plain selects.
4. Restyle the summary stats as a stat-tile row and the chart container as a glass
   card (24px radius, `bg-white/[0.04]`, `backdrop-blur-xl` in Tailwind terms).

This doc intentionally stops short of full component code — confirm the direction
(dark-first? DM Sans swap? chip-based filters?) before implementing, since each is a
real visual change to an app that currently uses default Next.js styling.
