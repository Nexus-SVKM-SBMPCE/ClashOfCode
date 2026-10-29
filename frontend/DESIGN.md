# Code Clash — Design System

Thesis: a contest judge you work inside. IDE precision, judge-grade clarity, one flourish: ICPC balloons.
Mode: Operate (product UI). Fully offline: fonts, icons and Monaco are bundled; nothing loads from the internet.

## Tokens (src/index.css :root)
| Role | Token | Value |
|---|---|---|
| Ground | --bg | #0B0D10 |
| Surfaces | --surface / --surface-2 / --surface-3 | #14171C / #1A1E24 / #21262E |
| Seams | --line / --line-strong | #292E36 / #3A414B |
| Text | --text / --text-2 / --text-3 | #F0F2F5 / #A1A8B3 / #858D99 (AA on surfaces) |
| Accent | --accent | #D8FF3E — primary action, active nav, focus ring only |
| Verdicts | --ac / --wa / --pending / --ce / --re | #3DDC97 / #FF646E / #F5B94C / #C9A0FF / #FF8A4C |

Balloons (lib/arena.ts): A #5AB0FF, B #B18CFF, C #FF8A4C, D #FF7AC6, E #C9D1DC, then cycle. Outline = open, filled = solved. Never used for large fills.

## Type
Inter for UI (13px base, 12 small, 14 body/prose, 18–20 titles, weights 500/600/650/700). JetBrains Mono for code, numbers, IDs, limits, times (tabular numerals). Fixed px scale, no fluid type.

## Space, shape, depth
4px grid (--s1…--s8). Radii 4/6/8px. Depth comes from hairline seams and one surface step; shadows only on floating toasts.
Header 48px, toolbars 40px, table rows 52px (submissions 40px).

## Components
- Buttons: .btn (neutral), .btn-primary (lime), .btn-ghost, .btn-icon; 30px tall, 38px for .btn-lg. Disabled primary turns neutral.
- Fields: .input / .select, lime border + soft ring on focus, aria-invalid turns red.
- Status: .verdict (mono chip per verdict), Difficulty (3 pips + label), Balloon, tests bar (one tick per test).
- Tables: .table inside .panel; secondary columns (.col-secondary) hide under 640px.
- Feedback: toasts bottom-right; inline errors; skeleton rows while loading; empty states that say what to do next.
- Icons: components/Icon.tsx, inline SVG, 24 grid, 1.75 stroke. No emoji.

## Layout
- Workspace: problem rail, then statement | 5px resizer | editor. Split 25–70%, saved in localStorage (cc-split), keyboard arrows on the resizer. Verdict strip docks under the editor.
- At 900px and below: header wraps to two rows; workspace shows one pane via the Problem/Code switch.
- At 640px and below: tighter gutters, secondary table columns hidden, shortcut hints hidden on touch devices.

## Motion
120–180ms, ease-out (0.16,1,0.3,1). Only state: verdict strip slide-in, balloon fill on solve, counter bump, live-dot pulse, toast entry. All reduced under prefers-reduced-motion.
