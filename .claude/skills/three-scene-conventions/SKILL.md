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

Camera moves are defined as phase -> {position, target} pairs, lerped/slerped between phases on transition. Never hardcode camera moves inline in animation loops — always go through this mapping.

