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

\- LM: \~4.3m diameter (legs extended), \~7m length, 1x descent engine, centered (model not loaded yet, data only)



\## State machine shape

mode: 'flow' | 'inspect'

flow.phase: 0-9 (int, discrete steps, not continuous scroll mapping)

flow.autoplayComplete: boolean

inspect.stage: 'stack' | 'exploded' | { isolated: stageId }



Scroll listener only active when mode === 'flow' \&\& flow.autoplayComplete === true.

Each scroll gesture advances phase by exactly 1 (debounced), not proportional to scroll distance.



\## Camera

Camera moves are defined as phase -> pose entries in cameraPath.js, lerped between phases on transition. Never hardcode camera moves inline in animation loops — always go through this mapping.

Pose fields: `{ position, target }` plus optional `frame: 'rocket'` (offsets resolved against the rocket group's local `(0, focusHeight, 0)` carried to world every frame — chase framing that tracks powered flight), `duration` (ms for the transition INTO the pose), `shake` (amplitude in meters, multiplied by the choreography-set shake gain), `orbitSpeed` (rad/s slow orbit around the focus point while a phase holds). Phases 0-2 are world-frame (pad-anchored); 3+ are rocket-frame. SceneManager resolves poses via `resolvePoseWorld()` and smooths the camera toward them (slight chase lag is intentional — vehicle accelerations read in-frame).

\## Staging choreography (sequences/StagingChoreography.js)

Owns the rocket transform for phases >= 3 and whenever a beat/glide runs. Rules:

\- A forward step from the ADJACENT phase plays that phase's timed beat (engine cutoff -> retro flash -> stage tumbles away as scene-attached debris -> next stage ignites).

\- Any other arrival (backward scroll, test-rig jump, inspect exit) glides \~0.9s to that phase's settled state; discrete facts (attached stages, burning engine) apply instantly. Every phase must stay reachable from any other.

\- LaunchSequence owns phases 0-2 while its countdown/liftoff run is active; entering phase >= 3 (or inspect) interrupts it via `interrupt()`.

\- Inspect mode rebuilds the full stack at the pad (home transforms stored per jettisonable, INCLUDING scale — scene.attach bakes the GLB feet->meters scale in) and the camera jumps to a canonical inspect pose; exiting re-syncs to the flow phase.

\- The LES tower is grouped at load into an 'LES' group inside the top assembly (RocketAssembly) and jettisons during the phase-5 beat.

\## Exhaust (particles/ExhaustSystem.js)

Per-stage systems built from EXHAUST\_PRESETS: F1\_CLUSTER (sea level, orange, pad-anchored smoke), J2\_CLUSTER / J2\_SINGLE (vacuum: wide, translucent, blue, no smoke). Plumes are additive gradient cones + glow sprites; `setStretch(k)` lengthens them with speed. Transparent-pass gotcha: the launch pad meshes carry `renderOrder = -1` so the fading pad never paints over the plumes — mind render order when adding new transparent objects near the pad.

