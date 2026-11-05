# Lanes · Design System

> Calm canvas, loud wins.

## 1. Direction

Two inspiration references, merged with intent:

| From ref 01 (Base Club, bold) | From ref 02 (financial dashboard, calm) |
|---|---|
| Royal-blue hero band with a faint grid | Light grey canvas, white bento cards |
| Giant, wide, heavy display type that runs edge to edge | Generous radii (20–40px), pill controls, round icon buttons |
| Hand-drawn arrows and squiggles in an accent color | Big friendly greeting line, date bubble, quiet secondary text |
| Frosted glass cards floating over the type | Single accent color used sparingly for data |
| Rotating circular sticker badge | Ring/donut progress, dot-grid streak history |
| Accent speech-bubble chips with numbers | Muted pill dropdown filters |

**The rule that ties them:** the *top* of the screen (hero band) is where the energy lives — royal blue, mega type, scribbles, celebrations. The *board* below is calm and readable — grey canvas, white cards, ink text — because that's where you work for hours. Loud stays in the hero and in reward moments only.

Palette mapping: ref 01's lime becomes **yellow `#F3C623`** (Yasmine's accent) — it's the dopamine color, used for progress fill, done states, streak, celebrations. Ref 02's orange survives only as the **Pending** stage color. Red appears **only** as hand-drawn marks (overdue circle, "DONE" circle).

## 2. Color

All values in `tokens.css`. Usage ratios on the board screen ≈ 70% grey/white, 20% royal (hero), 7% charcoal (text, ink buttons), 3% yellow.

| Token | Hex | Use |
|---|---|---|
| `--royal` | #195CB6 | Hero band, primary buttons, In-process stage, focus ring base |
| `--charcoal` | #1E1E1E | All text, ink buttons ("Receive" style in ref 02), New stage |
| `--grey-100` | #EDEDED | App canvas |
| `--yellow` | #F3C623 | Momentum fill, Done stage, streak sticker, celebratory chips |
| `--stage-pending` | #E8833A | Pending stage only |
| `--stage-postponed` | #9A9A9A | Postponed stage only |
| `--scribble-red` | #E5342B | Hand-drawn marks only — never fills, never buttons |

Contrast: charcoal on yellow (not white on yellow). White on royal is AA for all sizes ≥ 15px.

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Display (mega, h1, lane titles, numbers in hero) | **Marine Elmoure** → fallback **Archivo** at `wdth 125, wght 900` | UPPERCASE for mega/hero, tight leading 0.86, tracking −0.02em |
| Body / UI | **Poppins** 400/500/600 | 15px base |
| Arabic | **Madinet Al Bat** → fallback **Alexandria** 700/800 | Used for every Arabic run; `dir="auto"` on user text |
| Numbers | Poppins 600 with `font-variant-numeric: tabular-nums` | Counters must not jitter when rolling |

Font loading:
- Put Yasmine's licensed files in `packages/web/public/fonts/` (`MarineElmoure.woff2`, `MadinetAlBat.woff2`) with `@font-face` + `font-display: swap`. If missing, fallbacks must look intentional (Archivo wide black is close to the reference type).
- Google Fonts fallback link: `Archivo:wdth,wght@125,900`, `Poppins:wght@400;500;600;700`, `Alexandria:wght@600;800`.

**Bilingual titles:** hero and lane titles are bilingual. The Arabic word is layered *over* the English: English in mega display (charcoal on light / white on royal), Arabic smaller (≈40% size) in yellow, absolutely positioned overlapping the right third of the English word, rotated −4°. Example: `TODAY` with `اليوم` sitting on top of the "AY".

## 4. Shape, depth, texture

- Radii: board cards 28px, inner wells 20px, chips/buttons pill, app frame and hero band 40px (ref 02 frame).
- Mostly flat. Cards get `--shadow-card` (barely there). Dragging card gets `--shadow-lift` and rotates 2°.
- Glass cards (only on the hero): `--glass-bg` + `backdrop-filter: blur(14px)` + `--shadow-glass`, like the avatar cards in ref 01. Used for: the momentum card and the "Up next" mini card.
- Grid texture on royal: `.bg-royal-grid` (56px, 7% white lines).

## 5. Scribbles (hand-drawn layer)

SVGs in `design/assets/` — all `stroke="currentColor"`, so color them with CSS:

| File | Where | Color |
|---|---|---|
| `arrow-loop.svg` | Hero, pointing from greeting to the momentum card | yellow |
| `arrow-swoop.svg` | Empty-lane hints, quick capture hint | charcoal 40% |
| `arrow-down-curl.svg` | Empty board: "Dump everything here" → `+` | royal |
| `circle-scribble.svg` | Around overdue dates; around "DONE" at 100% | scribble red |
| `underline-scribble.svg` | Under hero text at tier 3 | yellow |
| `squiggle-z.svg` | Decorative, inside yellow chips (like ref 01's "2" squiggle) | charcoal |
| `sparkle.svg` | Momentum leading edge at tier 1+ | yellow |
| `check-draw.svg` | Done stamp — animate `stroke-dashoffset` 1 → 0 (pathLength=1) | charcoal on yellow |

Animate scribbles by drawing them in (`stroke-dasharray: 1; stroke-dashoffset: 1 → 0` with `pathLength="1"`), 500–700ms, `--ease-out`. Never more than 3 scribbles visible at once.

## 6. Components (visual spec)

**Header** — white pill buttons 48px round (menu, `+`, bell, search) as in ref 02. Logo: royal square 40px radius 12 with white "L" + yellow swoosh; wordmark "Lanes" Poppins 600 + "مسارات" grey below.

**Hero band** — royal grid, radius 40, padding 40/48. Left: date bubble (white outline circle, day number in display font) + "Wed, November" + mega bilingual `TODAY / اليوم`. Right: glass Momentum card. Bottom row: pill buttons **Pick for me** (yellow, charcoal text) and **Focus** (white outline), the rotating streak sticker overlapping the band's bottom-right edge.

**Momentum card (glass)** — label "MOMENTUM" micro uppercase; big rolling number `3/5` in display font; bar 16px tall pill, track white 20%, fill yellow with a slight inner highlight; tier text under it ("Halfway. That's real."); combo chip `×2` yellow speech bubble.

**Streak sticker** — 132px yellow circle, charcoal circular text "KEEP THE STREAK ·" rotating 18s linear infinite; center: day count (display font, 40px) + "days".

**Lane** — background `--lane-bg`, radius 28, padding 12. Header: stage dot (12px, stage color; New is an outline ring) + title (Poppins 600 16px) + count chip (white pill) + `+` round button. Done header has a tiny yellow check; Pending header uses orange dot.

**Task card** — white, radius 20, padding 16, gap 10.
- Top row: project chip (pill, 10% tint of project color + colored dot + name, 12px) · priority mark at right (urgent = red dot + "!", high = orange "!", low = nothing).
- Title: Poppins 500 15px, 2 lines max, `dir="auto"`.
- Pending: orange left rule 3px + reason line in 13px grey italic "Waiting on: …".
- Bottom row (13px grey icons): due date (overdue → red scribble circle around it), subtasks `2/5` mini bar, notes count, bell if reminder, ✳ if from Claude.
- Done cards: yellow check badge top-right, title charcoal 60%, no strike-through (we celebrate, not erase).
- Hover: lift 2px. Selected (keyboard): 2px royal ring.

**Drawer** — right side, 480px, white, radius 28 on the left corners, sunk inner wells for sections. Stage switcher: 5 pills in a row, active pill filled with stage color. Notes timeline: vertical 2px line, stage-colored dots, note body, meta (stage · time). Add-note input pinned to the bottom like ref 02's "Just ask me anything!" field.

**Quick capture** — centered 640px white panel, radius 28, big input 22px Poppins, parsed chips row underneath, footer hints in micro text. Backdrop: charcoal 30% + blur 6px.

**Focus mode** — full screen royal grid. Huge task title (display, 72–120px, wraps). Ring timer 320px: track white 15%, remaining arc yellow, center time `24:59` in display font. Subtasks as white glass checklist. Bottom: Done / +5 / Stop pills.

**Pick for me** — modal: question in h1 display; three big round buttons (Low / Medium / High) with battery-ish icons; then the dealt card (white, radius 28, rotated −3° settling to 0 with spring).

**Toasts** — charcoal pill, white text, yellow action text, bottom-center.

## 7. Motion

| Moment | Spec |
|---|---|
| Card move between lanes | `layout` animation, spring stiffness 500 damping 40 |
| Drag pickup | scale 1.03, rotate 2°, shadow-lift, 120ms |
| Done stamp | scale 1→1.06→1 (300ms spring) + check draw 350ms |
| Momentum fill | spring stiffness 120 damping 18; number rolls digit-by-digit |
| Burst | 12–20 pieces from card, colors yellow/royal/white/charcoal, 900ms |
| Tier 4 | full-viewport burst 120 pieces + "DONE" circle draw 700ms |
| Drawer | slide from right 380ms `--ease-out`, backdrop fade |
| Sticker | rotate 360° per 18s; spins 1 extra turn fast (600ms) at tier 2 |
| Reduced motion | no rotation, no confetti, only opacity/color changes |

## 8. Bilingual & RTL

- UI chrome is English (as Yasmine works), stage labels shown bilingually in lane headers (`In process · قيد التنفيذ`, Arabic in grey 70%).
- All user-entered text uses `dir="auto"` and inherits the Arabic font automatically when the text is Arabic (use `:lang(ar)` detection via a small `isArabic()` helper that sets `lang="ar"` on the element).
- Layout itself stays LTR in v1.

## 9. Voice (microcopy)

Short, reflective, a little poetic, never fluffy. Contrast framing welcome. No "amazing", "crushing it", "let's gooo".

- Empty board: "Dump everything here. Sort it later." / "طلّعي كل اللي في دماغك"
- Empty Done lane: "Nothing finished yet. Not a verdict, just a morning."
- Pending sheet: "What's it waiting on?"
- Postpone sheet: "Not now isn't never. When should it come back?"
- Server down: "Lanes is sleeping. Run `lanes start` to wake it."
- Focus end: "Time. Where did you land?"
