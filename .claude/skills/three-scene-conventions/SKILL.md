\---

name: three-scene-conventions

description: Conventions and constraints for the Apollo 11 Three.js scene. Use whenever writing or modifying code in src/scene/, src/data/stageSpecs.js, or anything touching the flow state machine.

\---



\# Three.js Scene Conventions



\## Version constraints (three 0.185.1)

\- OrbitControls IS available — import from 'three/examples/jsm/controls/OrbitControls.js'. Use it for the manual-orbit rocket inspection view instead of hand-rolling drag math.

\- CapsuleGeometry IS available if useful for rounded engine/tank shapes.

\- No other version constraints apply.

\- Use MeshStandardMaterial for realistic lighting response (metalness \~0.6, roughness \~0.4 for rocket body)



\## Stage data

The rocket is loaded from imported GLB models (src/scene/rocket/RocketAssembly.js) — there is no procedural fallback. If the GLB fails to load, that's a load error to fix, not a case to handle by building geometry in code.

Reference spec data (diameters, lengths, engine counts/types, labels) lives in src/data/stageSpecs.js as plain data, no three.js imports. It feeds inspection detail panels and stage labels:

\- S-IC: 10.1m diameter, 42m length, 5x F-1 engines, quincunx arrangement

\- S-II: 10.1m diameter, 24.8m length, 5x J-2 engines, quincunx arrangement

\- S-IVB: 6.6m diameter, 17.8m length, 1x J-2 engine, centered

\- CSM: 3.9m diameter, \~11m length, 1x SPS engine, centered

\- LM: \~4.3m diameter (legs extended), \~7m length, 1x descent engine, centered. Loaded from public/models/lunar module.glb (NASA Apollo LM model, Draco-decoded, WebP textures) at 0.9 scale, stowed invisible inside the SLA adapter until the phase-7 transposition beat reveals it. It IS a stage group ('LM', ordered between S-IVB and CSM) so inspection explode/isolate includes it. At load its flat mesh list is partitioned into 'LM-Descent' / 'LM-Ascent' groups by bounds-center against a y=2.5 cut in model space (RocketAssembly.splitLunarModuleStages — the meshes sit under one dense hub node, find it structurally); the lunar-liftoff beat jettisons 'LM-Descent' as a unit and the ascent group's userData.engineOffsetY anchors the APS exhaust.

\- Inside the CSM stage group, the CSM proper is wrapped in a 'CSM-Body' pivot group whose origin is the body center — the transposition flip is a plain rotation.z of that group. Its userData carries apexOffset (pivot->CM apex, for dock math) and engineOffsetY (SPS bell anchor). The SLA adapter mesh ('CSM-SLA-Adapter') jettisons separately. The CSM model is also split at load into 'CM' / 'SM' groups (splitCommandServiceModules): name prefix where present, geometric fallback against the aft heat shield's bottom — reentry jettisons 'SM' and flies the CM home alone. The recovery Parachutes (procedural, rocket/Parachutes.js — the GLB's chute node is degenerate) ride inside CSM-Body at apexOffset.



\## State machine shape

mode: 'flow' | 'inspect'

flow.phase: 0-13 (int, discrete steps, not continuous scroll mapping). MAX\_PHASE is exported from src/data/phases.js — never hardcode it. phases.js also carries the real Apollo 11 telemetry anchors (met = GET seconds, distEarthKm, distMoonKm, velocityMs, detail) that the HUD spools between; keep those roughly true to the mission, they are not decorative.

flow.autoplayComplete: boolean

inspect.stage: 'stack' | 'exploded' | { isolated: stageId }



Space-bar listener only active when mode === 'flow' \&\& flow.autoplayComplete === true.

Each space-bar press advances phase by exactly 1, forward only (debounced against key-repeat) — there is no scroll or backward trigger in the shipped experience; the test-rig arrow keys are dev-only.



\## Camera

Camera moves are defined as phase -> pose entries in cameraPath.js, lerped between phases on transition. Never hardcode camera moves inline in animation loops — always go through this mapping.

Pose fields: `{ position, target }` plus optional `frame: 'rocket'` (offsets resolved against the rocket group's local `(0, focusHeight, 0)` carried to world every frame — chase framing that tracks powered flight), `duration` (ms for the transition INTO the pose), `shake` (amplitude in meters, multiplied by the choreography-set shake gain), `orbitSpeed` (rad/s slow orbit around the focus point while a phase holds). Phases 0-2 are world-frame (pad-anchored); 3+ are rocket-frame. SceneManager resolves poses via `resolvePoseWorld()` and smooths the camera toward them (slight chase lag is intentional — vehicle accelerations read in-frame).

\## Staging choreography (sequences/StagingChoreography.js)

Owns the rocket transform for phases >= 3 and whenever a beat/glide runs. Rules:

\- A forward step from the ADJACENT phase plays that phase's timed beat (engine cutoff -> retro flash -> stage tumbles away as scene-attached debris -> next stage ignites).

\- Any other arrival (test-rig jump, inspect exit) glides \~0.9s to that phase's settled state; discrete facts (attached stages, burning engine) apply instantly. Every phase must stay reachable from any other.

\- LaunchSequence owns phases 0-2 while its countdown/liftoff run is active; entering phase >= 3 (or inspect) interrupts it via `interrupt()`.

\- Inspect mode freezes the mission exactly where it is — no rebuild, no pad reset. Whichever stages are currently attached (StagingChoreography.isStagePresent(id), backed by \_detached / the LM's reveal visibility) stay attached, and the rocket keeps its current position/tilt; only motion/animation stops. The camera frames a world-space focus point (inspection.getFocusWorldPosition(), the exploded-layout midpoint of PRESENT stages only, riding the rocket's current transform) at a distance scaled by inspection.getFramingScale() — the full 100m+ stack and a lone late-mission stage (e.g. just the LM) need very different camera distances. Home transforms are still stored per jettisonable (INCLUDING scale — scene.attach bakes the GLB feet->meters scale in) so \_snapTo can restore/detach correctly; exiting re-syncs to the flow phase via \_snapTo, which is what actually rebuilds from scratch.

\- The LES tower is grouped at load into an 'LES' group inside the top assembly (RocketAssembly) and jettisons during the phase-5 beat.

\- Phases 7-13 (T\&D -> lunar approach -> LM descent -> Tranquility Base -> ascent/rendezvous -> TEI -> reentry/splashdown) are fully choreographed. Discrete per-phase facts beyond `detached`: `csm` ('stowed' | 'docked' | 'gone' | 'cm' — CM alone at its home apex-up transform for reentry), `lm` (revealed or not), and `chutes` (phase-13 settled mains). The docked CSM transform is position.y = \_dockLocalY (computed at construction from the LM box + apexOffset), rotation.z = PI — the lunar rendezvous dock reuses exactly this transform. Beats 9 and 13 assume motion completes at 86%/90% of the beat (custom progress) and orientation/environment settle at 78%, so contact happens on settled ground/water.

\- Phase 10 deliberately has NO beat: it's a held tableau (same settled state as 9), so a 9->10 step is purely a camera re-frame + HUD beat via \_snapTo's glide.

\- Lunar liftoff (beat 11) abandons 'LM-DS' via \_abandonToMoon — parented onto the MOON group, not scene debris, so when the env channel shrinks/moves the Moon the stage recedes with the terrain it stands on. Its beat `ease` holds the environment still for the first 35% (vertical rise off solid ground). \_restore() reclaims objects from the debris list first, which is how Columbia comes back as a live object after departing as debris in beat 9.

\- Reentry plasma is an ExhaustSystem (REENTRY\_PLASMA preset) anchored at the CM heat shield with its group rotated PI so the wake streams up past the capsule. \_separate accepts `maxAge` (debris cleanup override) and skips the pyro flash when `flashScale <= 0`.

\- Camera gotcha for surface phases: the Moon-sphere ground at the landing site sits \~focus+81 in rocket-frame terms; a pose whose camera y lands below that grazing curvature ends up underground and the front-face-culled Moon vanishes (phase 10's pose keeps +7).

\- Environment staging: Earth/Moon/Ocean positions+scales+opacity and the key light (sun) position are per-phase data in SETTLED\[i].env, lerped through the same continuous channel as the rocket transform (\_applyContinuous). The Ocean (environment/Ocean.js, splashdown water) follows the same apply() contract and stays at the splash site with opacity 0 until phase 13; its disc carries renderOrder -1 like the pad, for the same transparent-pass reason. Phases <= 6 hold the bodies at their phase-7 entry marks with opacity 0 so the reveal is a fade, never a sweep. LIGHT\_SPACE points the sun +Z-ish for phases 7+ so both discs show a terminator. Phase 9's Moon is sized/placed so the sphere's TOP surface sits exactly under the LM footpads at the settled pos — the Moon sphere IS the landing terrain (no separate patch; a tiled canvas-noise bump map carries close-range detail). The 8->9 moon lerp path was chosen to keep that surface below the descending vehicle the whole way — don't move those env numbers without re-checking clearance.

\- Beats can start per-object tweens via c.\_addTween(duration, applyFn) (used for the CSM pull-ahead/flip/return). Tween-starting events must be instant-safe: skip the tween when `instant` and let a later event (the dock at 14.5) hard-set the final transform. \_flushTweens() runs on finishBeat/snapTo.

\- Debris accepts gravity: 0 for space separations (SLA, S-IVB, CSM) and radial: N for shroud discards that must clear the vehicle sideways.

\## Exhaust (particles/ExhaustSystem.js)

Per-stage systems built from EXHAUST\_PRESETS: F1\_CLUSTER (sea level, orange, pad-anchored smoke), J2\_CLUSTER / J2\_SINGLE (vacuum: wide, translucent, blue, no smoke), SPS\_SINGLE / DPS\_SINGLE (hypergolic: pale orange-pink, small — CSM braking burn and LM descent engine). Plumes are additive gradient cones + glow sprites; `setStretch(k)` lengthens them with speed. Transparent-pass gotcha: the launch pad meshes carry `renderOrder = -1` so the fading pad never paints over the plumes — mind render order when adding new transparent objects near the pad. SeparationFlash also owns `spawnDust(pos)` — normal-blended gray regolith burst used at LM touchdown.

\## Space environment (environment/Earth.js, Moon.js)

Textured spheres driven ONLY by the choreography env channel via `apply(x, y, z, scale, opacity)` — never positioned inline. Earth: NASA Blue Marble (public domain) + additive fresnel atmosphere rim, base radius 1800. Moon: NASA SVS CGI Moon Kit LROC color map (public domain) + tiled canvas-noise bump, base radius 1500, poles rotated horizontal so the landing site (sphere top) is texture-equator. Textures live in public/textures/. Stars are a full sphere (not hemisphere) since lunar phases look down as much as up.

