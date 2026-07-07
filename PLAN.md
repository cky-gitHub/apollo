# Apollo 11 Experience — Master Plan

## Guiding principle
Fable is scarce (usage-metered after July 7). Its edge is **judgment under-specification** and **hard multi-system choreography** — not "detailed work." Anything that can be written as a precise spec is Sonnet work. Therefore:

1. Specify everything specifiable here / in-chat (free).
2. Sonnet builds **rough-but-working** versions of every specifiable piece.
3. Fable inherits working code and does only: (a) the irreducibly hard choreography it must build from scratch, and (b) a polish/feel pass over what Sonnet built.

This minimizes Fable tokens and maximizes their value — Fable never spends tokens on plumbing or on decisions already made.

---

## Target codebase (where this is heading)

```
apollo/
├── .claude/skills/three-scene-conventions/SKILL.md   [source of truth — keep updated]
├── src/
│   ├── data/
│   │   ├── stages.js          ✅ stage geometry/engines
│   │   ├── phases.js          ▢ per-phase config: camera key, HUD text, telemetry, events
│   │   └── missions.js        ▢ Apollo 8/11/13/17 data for secondary section
│   ├── scene/
│   │   ├── SceneManager.js     ✅ renderer/camera/lights/loop (will grow)
│   │   ├── flowState.js        ✅ state machine container
│   │   ├── inspection.js       ✅ explode/isolate/orbit/labels
│   │   ├── cameraPaths.js      ◐ phase→{position,target}, stubbed values
│   │   ├── spaceStepper.js     ▢ debounced space-bar → phase advance
│   │   ├── rocket/
│   │   │   ├── RocketAssembly.js  ✅ stack (needs accuracy pass)
│   │   │   ├── stageBuilders.js   ◐ per-stage geometry (needs Saturn V detail)
│   │   │   ├── materials.js       ◐ shared materials/textures (needs work)
│   │   │   └── engines.js         ◐ F-1 / J-2 bells
│   │   ├── particles/
│   │   │   └── ExhaustSystem.js   ▢ flame/smoke sprite emitter
│   │   ├── environment/
│   │   │   ├── LaunchPad.js       ▢ pad 39A + tower/gantry
│   │   │   ├── Earth.js           ▢ earth sphere + curvature
│   │   │   ├── Moon.js            ▢ moon sphere
│   │   │   └── Skybox.js          ▢ starfield + sky-gradient shift
│   │   └── sequences/
│   │       ├── CountdownSequence.js    ▢ T-10→0 autoplay
│   │       ├── LiftoffSequence.js      ▢ ignition→first flying state
│   │       └── StagingChoreography.js  ▢ separation/TLI/lunar events  ← Fable core
│   ├── hud/
│   │   ├── Hud.jsx / Hud.css   ✅ wired (needs design pass)
│   │   ├── Countdown.jsx / Telemetry.jsx / PhaseLabel.jsx  ◐
│   ├── components/
│   │   ├── StageDetailPanel.jsx  ▢ spec-sheet for isolated stage
│   │   └── MissionCards.jsx      ▢ secondary section
│   ├── styles/
│   │   └── theme.css           ▢ design tokens (mission-control aesthetic)
│   ├── App.jsx / App.css       ✅
│   └── main.jsx                ✅
```
Legend: ✅ done · ◐ partial/rough · ▢ not started

---

## The split

### SONNET (precisely specifiable — build rough-but-working)
1. **Scroll-stepper + manual phase test rig** — debounced scroll → `phase += 1`; plus a temporary keyboard override (←/→) to jump phases so every later piece is testable without the full sequence running. *Build this FIRST — it's the test harness for everything else.*
2. **Geometry accuracy pass** — S-IC black roll stripes + "UNITED STATES" band, tapered (frustum) interstages, panel-line normal/texture detail, CSM thermal paneling, LM foil + strut legs, dark flared engine bells.
3. **Design system** — `theme.css` tokens + HUD redesign to mission-control aesthetic (spec below).
4. **Environment geometry** — launch pad + tower/gantry, Earth sphere, Moon sphere, star skybox + sky-gradient shift. (Parallelizable via subagents — each is independent.)
5. **Exhaust particle system (basic)** — sprite-based flame + smoke, additive blending, emitter that turns on at ignition.
6. **Countdown sequence** — T-10→0 timer driving phase 0, no input accepted.
7. **Liftoff mechanics (rough)** — position tween + camera track + particle trigger + tower fall-away + auto-stop at "first flying state." Working, not yet cinematic.
8. **Stage detail panels** — spec-sheet UI for isolated inspection view (labeled fields, monospace numbers).
9. **Secondary mission cards** — Apollo 8/13/17 data + card layout. Lowest priority.

### FABLE (irreducible — build from scratch or polish inherited code)
- **A. Staging separation choreography (phases 3–6)** — S-IC detach + tumble, S-II ignite, interstage jettison, LES tower jettison, S-IVB burn/TLI. Many objects + particles + camera reacting together, timing must *read* correctly. Cannot be fully pre-specified.
- **B. TLI + lunar phases (7–9)** — Earth-shrink / Moon-grow parallax, CSM/LM transposition-and-docking, S-IVB discard, LM descent. Multiple moving elements composing into one legible shot.
- **C. Cinematic polish pass** — feel/timing/easing over the *inherited* liftoff + camera paths + exhaust. This is where "alright" becomes "next level."

---

## Design system spec (hand to Sonnet in step 3 — no guessing)
- Background: near-black `#0a0e12` throughout (not pure black), not just the canvas.
- Fonts: monospace (JetBrains Mono / system mono) for all HUD/telemetry/countdown/spec-sheet numbers; sans-serif only for long-form descriptive prose.
- Accent: amber `#ffa500`-range or phosphor-green — 1960s mission-control palette. No modern blue/purple gradients.
- HUD chips: thin bordered instrument boxes, subtle text-shadow glow on the accent color. Not soft rounded modern cards.
- Stage detail panels: read like a spec sheet — labeled fields + monospace values, not prose paragraphs.

---

## Build order (Sonnet), with dependencies
1. Scroll-stepper + phase test rig  *(unblocks testing everything below)*
2. Geometry accuracy pass  *(independent)*
3. Design system + HUD redesign  *(independent)*
4. Environment: pad, Earth, Moon, skybox  *(independent; subagent-parallelizable)*
5. Exhaust particles (basic)  *(needed before liftoff)*
6. Countdown sequence  *(needs flowState — done)*
7. Liftoff mechanics rough  *(needs pad + particles + camera paths)*
8. Stage detail panels  *(independent — inspection UI)*
9. Mission cards  *(last)*

→ **then Fable:** A (staging) + polish liftoff → B (TLI/lunar) → C (global cinematic polish).

---

## Workflow notes (skills / orchestration learning goals)
- **Skill = source of truth.** After each pass that changes a constraint or data shape, update `SKILL.md` so every future session (including Fable) inherits it automatically. It already carries stage data, state shape, version notes.
- **Subagents** fit step 4 best: pad / Earth / Moon / skybox are mutually independent — dispatch them in parallel from one orchestrating thread. Also step 2 (geometry) and step 3 (design) are independent of each other and can overlap.
- **Plan-then-execute (opusplan-style)** is worth trying when you reach Fable step A — staging choreography has genuinely unclear dependencies, which is exactly where deliberate planning before code pays off.
- **Commit after every numbered step** — clean checkpoints mean Fable never has to debug half-finished Sonnet work while also doing hard choreography.

---

## The one honest risk to watch
The temptation will be to keep polishing geometry/design forever with Sonnet because it's "included," and never actually reach the Fable choreography — which is the part that makes this project special. Timebox steps 1–9. They're the runway; the launch (A/B/C) is the point.
