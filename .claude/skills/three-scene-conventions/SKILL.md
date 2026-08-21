\---

name: three-scene-conventions

description: Conventions and constraints for the Apollo 11 Three.js scene. Use whenever writing or modifying code in src/scene/, src/data/stageSpecs.js, or anything touching the flow state machine.

\---



\# Three.js Scene Conventions



\## App shell / routing (added when the site grew beyond a single page)

The mission flow no longer owns the whole app. src/App.jsx is now a react-router shell (routes for /, /about, /program, /apollo-11, /missions, /missions/:missionId, /legal/impressum, /legal/privacy) wrapped in a persistent Nav + conditional Footer; every page is React.lazy-loaded so the three.js/GLTFLoader payload only ships to routes that actually need it. src/pages/HeroPage.jsx is the ONLY place SceneManager gets constructed — it is exactly the old App.jsx body (same mount-on-effect/dispose-on-cleanup lifecycle, same FlowStore/Hud wiring), just relocated. Do not mount SceneManager anywhere else.

HeroPage keeps the canvas + Hud both `position: fixed` (matching Hud.css's own long-standing convention — see below) inside a `.hero-fixed` layer, followed by a same-height spacer and then HeroIntro's real content, which scrolls up over the fixed layer (curtain reveal) rather than the hero scrolling away normally. An IntersectionObserver on the spacer calls `sceneManager.setPaused(true/false)` (SceneManager.js) once the hero is fully covered, so the render loop idles (RAF keeps ticking, but skips update/render work) while a visitor reads the content below instead of burning frames off-screen. Mission state is untouched by pausing; resuming just picks the render back up.

Hud.css's `.hud-phase` / `.hud-clock` top offsets are `calc(var(--site-nav-height, 1.6rem) + 1rem)`, not a bare `1.6rem` — they now share the viewport with the persistent Nav (site-nav, z-index 30, above Hud's z-index 10) and would otherwise sit underneath/behind it. `--site-nav-height` is defined in src/styles/site-theme.css; the fallback keeps Hud.css degrading sanely if that variable is ever missing. Below 640px, Hud.css stacks the phase block, GET clock, telemetry row, and hint into one left-aligned/full-width column (see the "narrow viewports" block at the end of the file) — the original side-by-side layout has no room to breathe once a viewport gets phone-narrow, on top of the nav now also claiming the top of the screen.

src/components/site/RocketViewer.jsx is a SEPARATE, standalone reuse of `buildRocketStack()` (RocketAssembly.js) for the Apollo 11 content page — its own tiny scene/camera/renderer/OrbitControls, no flowStore, no choreography, no Hud, fully disposed on unmount. It does not touch or share state with SceneManager/HeroPage's instance; the two are independent GLB loads. If you add another content-page 3D reuse, follow RocketViewer's pattern (own lifecycle, own disposal), not SceneManager's.



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

\- Inside the CSM stage group, the CSM proper is wrapped in a 'CSM-Body' pivot group whose origin is the body center — the transposition flip is a plain rotation.z of that group. Its userData carries apexOffset (pivot->CM apex, for dock math) and engineOffsetY (SPS bell anchor). The CSM model is also split at load into 'CM' / 'SM' groups (splitCommandServiceModules): name prefix where present, geometric fallback against the aft heat shield's bottom — reentry jettisons 'SM' and flies the CM home alone. The recovery Parachutes (procedural, rocket/Parachutes.js — the GLB's chute node is degenerate) ride inside CSM-Body at apexOffset.

\- The SLA (RocketAssembly.createSlaAssembly) is two parts, mirroring the real hardware: 'SLA-Ring' (fixed aft section, attached to the S-IVB STAGE GROUP so it departs with the S-IVB after LM extraction — the LM's stow height is measured from ITS bottom) and 'CSM-SLA-Adapter' (the four forward petals, in the CSM stage group). Each petal mesh sits inside an 'SLA-Panel-i' hinge group whose origin is ON its hinge line, with userData.hingeAxis (unit tangent — rotate about +axis to tip the top outward) and userData.outward (unit radial), stack-local. 'SLA' remains a SINGLE jettisonable id: beat 7 fires \_openSlaPanels (hinge tweens to \~50°, tracked in \_slaTweens) then \_releaseSlaPanels (instant-safe: scene-attaches each petal as tumbling zero-g debris and removes the empty group; instant path just removes the closed group). \_restore('SLA') re-homes the petals via \_resetSlaPetals — petal homes are stored separately in \_slaPetals.



\## State machine shape

mode: 'flow' | 'inspect'

flow.phase: 0-13 (int, discrete steps, not continuous scroll mapping). MAX\_PHASE is exported from src/data/phases.js — never hardcode it. phases.js also carries the real Apollo 11 telemetry anchors (met = GET seconds, distEarthKm, distMoonKm, velocityMs, detail) that the HUD spools between; keep those roughly true to the mission, they are not decorative.

flow.autoplayComplete: boolean

inspect.stage: 'stack' | 'exploded' | { isolated: stageId }



flow.autoplayComplete defaults to FALSE (flowState.js) — the real T-10 countdown must actually run. SceneManager.init() auto-calls launchSequence.start() (previously this was ONLY reachable via the dev test-rig's 'L' key, which meant the shipped path fell through to StagingChoreography's generic 0.9s glide between phases 0-2 instead of the tuned 2s ignition-hold + 9s liftoff rise — looked like the rocket snapping upward). The countdown ticks 10->0 and flips autoplayComplete once it hits 0, which is also what unlocks the Space-bar listener.

\## Mission autoplay (sequences/MissionAutoplay.js)

The ENTIRE 0-13 flow now plays by itself, unattended — this is the primary experience, not a fallback. Constructed in SceneManager.init() alongside StagingChoreography, updated every frame from \_animate(). Waits for "ready" (phases 0-2: launchSequence.stage === 'holding'; phases 3+: choreography.isSettled() \&\& !sceneManager.cameraTransitioning, so it never cuts a beat or camera blend short), then holds the settled shot for a per-phase pacing beat (HOLD\_SECONDS map — longer on phase 9 touchdown and especially phase 10 Tranquility Base) before calling flowStore.setPhase(phase + 1). Stops itself once mode leaves 'flow' (inspect freezes it, matching the choreography's own freeze) or flow.phase reaches MAX\_PHASE.

Space-bar stepping (spaceStepper.js) and the test-rig still work as manual overrides/skip-aheads — MissionAutoplay only reads flow.phase from the store, so a manual step (which can cut a beat short, same as before) just gets picked up as the new "current phase" with no special-casing needed. Any store emit resets MissionAutoplay's own pacing-hold timer, so it never fires immediately after a manual step lands mid-transition.

StagingChoreography.isSettled() is the public surface MissionAutoplay reads instead of poking \_beat/\_glide/\_tweens directly; SceneManager.cameraTransitioning is the equivalent public getter for \_cameraTransition. Keep exercising through these when adding future autoplay-adjacent logic rather than reaching into the underscored internals from outside.

\*\*Gotcha (fixed 2026-07-09, watch for regressions):\*\* StagingChoreography's continuous \_flightPos/\_flightTilt state is separate from rocket.position — during phases 0-2, LaunchSequence writes rocket.position directly and StagingChoreography does NOT own the transform. Its update() loop now has an explicit else-branch (no beat/glide/phase>=3) that mirrors \_flightPos/\_prevFlightPos from the live rocket.position every frame, specifically so \_captureContinuous() at the 2->3 handoff starts from where the rocket actually is (y=35 post-liftoff) instead of the stale (0,0,0) it was constructed with. Without this the rocket visibly snapped back to the pad for one frame the instant Max-Q's beat began, before climbing again — if you ever see a similar snap-then-catchup at a phase boundary, suspect a continuous-state field that isn't being kept in sync while some OTHER system briefly owns the transform.

Space-bar listener only active when mode === 'flow' \&\& flow.autoplayComplete === true.

Each space-bar press advances phase by exactly 1, forward only (debounced against key-repeat) — there is no scroll or backward trigger in the shipped experience; the test-rig arrow keys are dev-only. Manual stepping is now purely an accelerant on top of MissionAutoplay, not a requirement to see the mission through.



\## Camera

Camera framing is defined as phase -> pose entries in cameraPath.js. A phase change BLENDS smoothly into the new pose (SceneManager.setPhase builds a `_cameraTransition` eased over the pose's `duration`, same mechanism as the inspect-exit glide) rather than cutting — 2026-07-20 session, reversing the prior "hard cut" design after the user reported abrupt transitions. The blend's start point is frozen at the moment of the cut via `fromOrbit` (the live `_manualAzimuth`/`_manualPolar` at that instant), so it begins from wherever the user's free-look (freeLook.js) actually left the view instead of snapping back to the shot's nominal center first. Rocket-frame poses on both ends of a blend keep tracking the live vehicle transform throughout (resolvePoseWorld reads `rocket.position`/`quaternion` fresh every frame), so a blend never detaches from a moving vehicle. There is no scripted `orbitSpeed` drift — the only OTHER in-shot view change is the user's free-look. Never hardcode camera moves inline in animation loops — always go through the pose mapping.

Pose fields: `{ position, target }` plus optional `frame: 'rocket'` (offsets resolved against the rocket group's local `(0, focusHeight, 0)` carried to world every frame — chase framing that tracks powered flight), `duration` (ms for the glide INTO the pose — used by every phase change now, not just inspect-exit), `shake` (amplitude in meters, multiplied by the choreography-set shake gain). Phases 0-2 are world-frame (pad-anchored); 3+ are rocket-frame. SceneManager resolves poses via `resolvePoseWorld()` and smooths the camera toward them (slight chase lag is intentional — vehicle accelerations read in-frame).

Framing gotcha for AIMED phases (7/8/12, see the attitude bullet in the choreography section): never put the camera offset on (or near) the stack's aim axis — the vehicle reads as a nose-on disc and the body it aims at hides exactly behind it (p12's old [44,12,52] was almost exactly the aim axis). Sit 25-70° off the axis so the shot reads 3/4 with the destination body in frame.

\## Mission space (scene/missionSpace.js) — the ONE spatial model

Every Earth/Moon env tuple is COMPUTED from a real-scale model, never hand-tuned by eye. The simulation scale is real kilometers (true radii, the same distEarthKm/distMoonKm anchors phases.js feeds the HUD); the render mapping is nonlinear: `compressDistance()` (identity to 2,600 units, then logarithmic — the full 384,400 km lands at \~5,360 units) plus a per-body rendered radius that PRESERVES TRUE APPARENT ANGULAR SIZE at the compressed distance. `bodyMark(body, vehiclePos, dir, surfaceDistKm)` returns the `[x,y,z,scale,opacity]` env tuple. Two clamps: (1) near a body the angular-preserving radius explodes, so it clamps at `groundRadius` (Earth 40,000, Moon 2,550) and the sphere becomes standing terrain — `groundMark(body, siteX, siteZ, topY)` places it with its top surface AT a site (pad grade -24, i.e. just under LaunchPad GRADE\_Y=-22; splash-site ocean 34, just under the ocean disc at 40); (2) far away a floor of \~0.7° apparent radius (MIN\_APPARENT\_SIN) keeps the Moon-from-Earth / Earth-from-Moon dot barely-visible instead of a sub-pixel speck (the honest 0.26° disc is invisible at render resolution).

World-axis convention: the Moon always lives on the +X side of the sky, Earth on the -X side or underfoot. Phases 0-6: Earth is a FIXED ground sphere under the pad (the pad stands on it — liftoff to TLI is one continuous ground -> curvature -> globe reveal, no swap) and the Moon hangs at one fixed sky anchor (MOON\_SKY\_DIR, low over the Atlantic). Outbound coast: Moon ahead on +X, Earth marble behind on -X. Lunar ops: Moon underfoot, Earth \~40°-high in the -X sky. Return leg FLIES -X (SETTLED\[12/13].pos x decreases, splash site at x=-400): Earth-dot ahead at -X, big Moon behind at +X. Arrival mirrors departure: phase 13 brings Earth back as groundMark terrain with the Moon a daytime dot again.

Gotchas learned solving this:

\- Camera far plane is 30,000 (SceneManager) because the ground-Earth's visible limb from ascent height is \~13,000 away — a 10,000 far plane cut a hole where the horizon should be.

\- PHASE ANGLE decides whether a far body is visible at all: a dot/marble near the sun direction renders as an unlit sliver. Keep any body you want SEEN \~60°+ away from that phase's `env.light` direction — this is why the surface phases' Earth sits on the +z (camera) side while LIGHT\_SURFACE has the sun at -z, and why MOON\_SKY\_DIR is \~66° from LIGHT\_HOME.

\- A 180° look-back keeps the camera's z side, so "behind the vehicle" bodies that should fill the rear view need the SAME z sign as the camera offset (see phase 12's moon).

\- Both channels of a beat lerp env linearly; the beats into/out of ground-sphere regimes (6->7, 12->13) were clearance-checked so the camera never enters the sphere mid-lerp (front-face culling makes an entered sphere vanish). The 12->13 dive relies on the beat's env ease (settles 78%) running AHEAD of motion (90%) — a raw synchronized lerp would clip. Re-check clearances if you move SETTLED positions or these dirs.

\## Staging choreography (sequences/StagingChoreography.js)

Owns the rocket transform for phases >= 3 and whenever a beat/glide runs. Rules:

\- A forward step from the ADJACENT phase plays that phase's timed beat (engine cutoff -> retro flash -> stage tumbles away as scene-attached debris -> next stage ignites).

\- Any other arrival (test-rig jump, inspect exit) glides \~0.9s to that phase's settled state; discrete facts (attached stages, burning engine) apply instantly. Every phase must stay reachable from any other.

\- LaunchSequence owns phases 0-2 while its countdown/liftoff run is active; entering phase >= 3 (or inspect) interrupts it via `interrupt()`.

\- Inspect mode is a true FREEZE-FRAME, mid-beat included: \_enterInspect only interrupts LaunchSequence (which otherwise writes rocket.position every frame regardless of mode) — it does NOT finish the beat, flush tweens, clear debris, or extinguish engines. Everything simply stops advancing (choreography.update early-returns in inspect), so a mid-transposition SLA petal hangs frozen in space and a burning engine keeps its plume alive on the frozen vehicle; the environment/backdrop/lighting are untouched. The CAMERA does not move either: SceneManager hands OrbitControls the current shot's look-target and position as-is (no canned offset, no jump), and the exploded layout is re-centered on the present stack's current midpoint (inspection.\_explodedY subtracts \_explodeShift) so the explosion expands IN PLACE within the frozen framing — a layout that only grew upward would walk half the vehicle out of frame. Only an isolate-click retargets the orbit. Whichever stages are attached (StagingChoreography.isStagePresent(id)) stay attached. Home transforms are still stored per jettisonable (INCLUDING scale — scene.attach bakes the GLB feet->meters scale in); exiting re-syncs to the flow phase via \_snapTo, whose \_finishBeat() fast-forwards a paused beat instant-safely (that is what rebuilds/cleans up), and the camera glides back to the phase pose (same blend mechanism phase changes use, see the Camera section).

\- Vehicle ATTITUDE is (tilt, yaw), both continuous channels lerped like pos: tilt leans the stack about -z, yaw then swings that lean around world +Y (rocket.rotation.order = 'YZX', set in the choreography constructor; stack axis = (sin·cos(yaw), cos(tilt), -sin·sin(yaw))). The aim() helper converts a world direction into those angles, and the coast phases USE it so the spacecraft faces where it is going: 7/8 aim +Y (the SPS end — the transposition flip put the bell forward, the real LOI braking attitude, so beat 8's burn streams its plume at the Moon ahead) along MOON\_DIR\_7/8; 12 aims +Y AWAY from Earth (CM apex leads home, SPS fires back at the Moon — the real TEI attitude). The same dir constants feed the env bodyMark calls, so the stack points at the RENDERED body by construction. Tilt alone can never point at a body with a z component — every cislunar mark has one, which is why yaw exists.

\- While Eagle is on the Moon (csm 'gone': phases 9/10 and beat 11 until the rendezvous \_restore), Columbia is NOT debris and NOT absent — \_csmToOrbit puts it in a visible lunar parking orbit, driven every frame by \_updateCsmOrbit around the LIVE Moon center (same reason \_abandonToMoon parents onto the Moon group: env lerps move the orbit with the terrain). Beat 9's undocking eases from the departure push onto the track over ~10s; \_snapTo arrivals place it on the track directly; \_restore('CSM') ends the orbit (rendezvous, or any jump to a docked/stowed phase). The track skims low over the -x/-z horizon the surface cameras frame — that quadrant is sunward, so the model is backlit and an additive glint sprite rides it (which is also what a sunlit spacecraft against the lunar sky really reads as: a slow-moving star).

\- The LES tower is grouped at load into an 'LES' group inside the top assembly (RocketAssembly) and jettisons during the phase-5 beat.

\- Phases 7-13 (T\&D -> lunar approach -> LM descent -> Tranquility Base -> ascent/rendezvous -> TEI -> reentry/splashdown) are fully choreographed. Discrete per-phase facts beyond `detached`: `csm` ('stowed' | 'docked' | 'gone' | 'cm' — CM alone at its home apex-up transform for reentry), `lm` (revealed or not), and `chutes` (phase-13 settled mains). The docked CSM transform is position.y = \_dockLocalY (computed at construction from the LM box + apexOffset), rotation.z = PI — the lunar rendezvous dock reuses exactly this transform. Beats 9 and 13 assume motion completes at 86%/90% of the beat (custom progress) and orientation/environment settle at 78%, so contact happens on settled ground/water.

\- Phase 10 deliberately has NO beat: it's a held tableau (same settled state as 9), so a 9->10 step is purely a camera re-frame + HUD beat via \_snapTo's glide.

\- Lunar liftoff (beat 11) abandons 'LM-DS' via \_abandonToMoon — parented onto the MOON group, not scene debris, so when the env channel shrinks/moves the Moon the stage recedes with the terrain it stands on. Its beat `ease` holds the environment still for the first 35% (vertical rise off solid ground). \_restore() reclaims objects from the debris list first, which is how Columbia comes back as a live object after departing as debris in beat 9.

\- Reentry plasma is an ExhaustSystem (REENTRY\_PLASMA preset) anchored at the CM heat shield with its group rotated PI so the wake streams up past the capsule. \_separate accepts `maxAge` (debris cleanup override) and skips the pyro flash when `flashScale <= 0`.

\- Camera gotcha for surface phases: the Moon-sphere ground at the landing site sits \~focus+81 in rocket-frame terms; a pose whose camera y lands below that grazing curvature ends up underground and the front-face-culled Moon vanishes (phase 10's pose keeps +7).

\- Environment staging: Earth/Moon/Ocean positions+scales+opacity and the key light (sun) position are per-phase data in SETTLED\[i].env, lerped through the same continuous channel as the rocket transform (\_applyContinuous) — but the Earth/Moon tuples are now BUILT by missionSpace.js bodyMark/groundMark from real distances (see the Mission space section); only the per-phase DIRECTION vectors and the light are authored. Both bodies are visible at EVERY phase (Earth is the ground 0-6, the Moon a launch-sky dot) — there are no opacity-0 reveal marks anymore except the Ocean. The Ocean (environment/Ocean.js, splashdown water) keeps the old pattern: at the splash site (x=-400) with opacity 0 until phase 13; its disc carries renderOrder -1 like the pad, for the same transparent-pass reason. Phase 9/10's Moon is a groundMark whose TOP surface sits exactly under the LM footpads (topY 2171) — the Moon sphere IS the landing terrain (no separate patch; a tiled procedural crater-field bump map carries close-range detail). The 8->9 moon lerp path keeps that surface below the descending vehicle the whole way — don't move those env dirs without re-checking clearance.

\- Distance-to-Earth/Moon must never visibly move at the instant hardware separates — a jettison is a discrete event with no real bearing on position, so it reading as "the planet just got closer/farther" is a bug, not a coincidence to shrug off. \_applyContinuous takes an independent `envEaseT` (defaults to the tilt/sky/pad `easeT` if not given) so a beat can hold Earth/Moon/light dead flat through a drop while everything else keeps its own timing. The shared helper is `holdThenEase(holdFrac, endFrac=1)` (fractions of the beat's total duration): held at 0 until `holdFrac`, eases to 1 by `endFrac`. Every beat with an embedded jettison sets `envEase: holdThenEase(...)` past that event with a buffer — beats 4/5/6 hold past the S-IC/LES/S-II drops before ascent's small Moon-parallax shift resumes; beat 7 holds through the SLA jettison (2.9-4.2s) and settles by 80% of the beat, well before the S-IVB departs at 16.3s; beat 12 holds through the LM/Eagle jettison and only starts moving once the TEI burn actually lights, finishing by cutoff; beats 9/13 hold a short buffer past the CSM/SM jettisons before resuming the genuinely-continuous descent/reentry distance change. Beat 11's pre-existing "hold first 35%, then ease" is the same pattern, now built from the same helper. If you add a new beat with a mid-beat separation, give it an explicit `envEase` — don't rely on the default `easeInOutCubic(t)` just because its slope is small near t=0, that only hides the bug for separations that happen very early in a long beat.

\- Earth is a CONTINUOUS pull-back from pad to marble: phases 0-6 hold ONE fixed groundMark under the pad (the vehicle climbing away from it does all the work — Max-Q shows the limb as the horizon, TLI a receding curve), and the 6->7 T&D beat lerps it out to bodyMark's true-angular-size marble (13° radius at 22,000 km). Gotcha kept from the old design: the flat launch-pad terrain would read as a translucent shelf across the curved globe while fading, so the pad channel alone is front-loaded in \_applyContinuous (`padT = min(1, easeT/0.4)`); phase-3 pad target is 0. Earth texture anisotropy is 16 (grazing-angle ascent views); sphere tessellation is 128x96 because at ground scale the limb IS the horizon line and 64 segments visibly scallop it. Earth.js rotation ('ZYX' order, z=1.07 y=1.4) puts Cape Canaveral's latitude/longitude at the sphere TOP — the ground you lift off from is the Florida coast, not polar ice or Sahara (both were tried by accident; top-point texture longitude = 180° - y·RAD2DEG).

\- Earth FIDELITY stack (Earth.js, rebuilt 2026-07-13): color is NASA Blue Marble NG July 2004 at 8192x4096 (public/textures/earth\_blue\_marble\_8k.jpg — the mission month; oceans are the dark bathymetry navy, not the old flat blue), plus earth\_normal\_2048 (normalScale 0.85 — planet relief should whisper), earth\_roughness\_2048 (the three.js specular water mask INVERTED offline: oceans ~0.35 so the sun glints off water, land ~0.95), a separate cloud shell at 1.004R (NASA cloud composite as alphaMap on MeshLambert — sun-shaded, so clouds die past the terminator), and night-side city lights (NASA Earth's City Lights) patched into the standard material via onBeforeCompile: emissive past the terminator using `nonPerturbedNormal` (view-space geometric normal — `geometryNormal` does NOT exist yet at the emissivemap\_fragment hook, it's declared later in lights\_fragment\_begin; this cost one broken-shader round). The sun direction reaches both patches as a VIEW-SPACE uniform, updated per frame from keyLight in Earth.update(camera, keyLight) — the old updateAtmosphere(cameraPos) signature is gone; SceneManager calls earth.update every frame. The fresnel atmosphere shell (1.2% of radius) is now also sun-aware (bright blue on the lit limb, dead on the night side) and still fades with camera altitude above the shell, as does the cloud shell — from inside the atmosphere you're UNDER the weather, not looking at a painted shell 120 m over the pad.

\- Sun / lighting consistency: the key light IS the visible Sun — environment/Sun.js (a camera-riding additive billboard) locks its disc to `keyLight.position` every frame in SceneManager.\_animate, so wherever the disc appears the Earth/Moon/vehicle are lit from exactly that direction (the lit hemisphere always faces the disc you can see). Because of this lock, the per-phase `env.light` vector is a real sun DIRECTION, not a free knob. Two regimes: LIGHT\_SPACE = \[1600,1700,2500] lights the coast phases (7,8,11,12) from up-and-camera-side so Earth/Moon read as a legibly-lit gibbous with a clear terminator while the hero vehicle stays bright — the disc itself sits off-frame behind the shoulder (a near-full Earth means the Sun is behind you; you CANNOT have both a front-lit hero and the disc in a 50° FOV, so don't try). LIGHT\_SURFACE = \[-880,60,-3280] drops the Sun low and in-front for phases 9-10: the disc clears the lunar horizon in-frame, the regolith rakes into long shadows, and the LM back/side-lights — SceneManager.fillLight was lifted to 0.5 (warm regolith-gray ground term) so the LM's shadow side still reads. The 8->9 descent beat swings the light ~180° (coast->surface); that reads as the Sun rising into view as you descend — verified not jarring, but re-check a mid-beat frame if you retime it. Sun opacity tracks the sky altitudeFactor (fades in with the stars, out again at the phase-13 blue-sky splashdown).

\- Beats can start per-object tweens via c.\_addTween(duration, applyFn) (used for the CSM pull-ahead/flip/return). Tween-starting events must be instant-safe: skip the tween when `instant` and let a later event (the dock at 14.5) hard-set the final transform. \_flushTweens() runs on finishBeat/snapTo.

\- Debris accepts gravity: 0 for space separations (SLA, S-IVB, CSM) and radial: N for shroud discards that must clear the vehicle sideways. Direction rule for spent hardware: nothing may read as "heading back to Earth" unless it really did. The S-IVB (beat 7) and Eagle (beat 12) depart radial-dominant (back \~1.5-2, radial 6-7) — the real S-IVB made an evasive maneuver to a lunar slingshot, and Eagle stayed in lunar orbit; a back-dominant push slid both along -axis straight toward the Earth marble behind the stack.

\## Exhaust (particles/ExhaustSystem.js)

Per-stage systems built from EXHAUST\_PRESETS: F1\_CLUSTER (sea level, orange, pad-anchored smoke), J2\_CLUSTER / J2\_SINGLE (vacuum: wide, translucent, blue, no smoke), SPS\_SINGLE / DPS\_SINGLE (hypergolic: pale orange-pink, small — CSM braking burn and LM descent engine). Plumes are additive gradient cones + glow sprites; `setStretch(k)` lengthens them with speed. Transparent-pass gotcha: the launch pad meshes carry `renderOrder = -1` so the fading pad never paints over the plumes — mind render order when adding new transparent objects near the pad. SeparationFlash also owns `spawnDust(pos)` — normal-blended gray regolith burst used at LM touchdown.

\## Space environment (environment/Earth.js, Moon.js, Sun.js)

Textured spheres driven ONLY by the choreography env channel via `apply(x, y, z, scale, opacity)` — never positioned inline (Earth additionally gets a per-frame `update(camera, keyLight)` presentation call from SceneManager for the rim/cloud fades and the view-space sun uniform — that's display, not staging; see the Earth-fidelity bullet in the choreography section for the full texture/material stack). Earth: NASA Blue Marble NG 8k + normal/roughness/night/cloud maps + additive sun-aware fresnel rim, base GEOMETRY radius 1800 — but the env scale is computed by missionSpace.js (22.2x as the ground sphere, fractions as the marble), so never reason from "radius 1800" alone. Moon: NASA SVS CGI Moon Kit LROC color map (public domain) + tiled procedural crater-field bump map (seeded/deterministic — buildCraterBumpTexture draws power-law-sized bowls with raised rims plus regolith grain, wrap-around copies at tile edges for seamless repeat at 16x8), base radius 1500, poles rotated horizontal so the landing site (sphere top) is texture-equator; rotation.y = PI/2 parks the UV poles on world ±Z where the tiled bump's radial pole-pinch artifact stays out of every phase camera (at y=1.1 it sat dead-center in the phase-8 approach disc). Textures live in public/textures/. Stars are a full sphere (not hemisphere) since lunar phases look down as much as up.

The Sun (environment/Sun.js) is a procedural additive billboard (hot white core -> warm corona gradient canvas) that rides the camera at a fixed radius (3600 < star radius 3800 < dome radius 4000) so it reads as infinitely distant with no parallax. It is NOT positioned per-phase — SceneManager.\_animate calls `sun.update(camera, keyLight, altitudeFactor)` every frame, which places the disc along `keyLight.position` (the light's target is the origin, so its normalized position IS the direction to the sun). This is the mechanism that keeps the visible Sun and the incident lighting identical — see the "Sun / lighting consistency" bullet above for the direction regimes.

\## Launch pad (environment/LaunchPad.js)

Procedural LC-39A evocation: scrub/beach/Atlantic terrain (+X is east — the gravity turn flies out over the water), raised hardstand mound with the flame trench cut along Z (deflector ridge inside), Mobile Launcher Platform on pedestals with its deck TOP at y=0 (the rocket's resting height — the vehicle is never repositioned for the pad), and the Launch Umbilical Tower at x=-20 (lattice legs/braces, hammerhead crane, nine swing arms, white room on the top arm). All materials are created inside buildLaunchPad and shared with nothing else — StagingChoreography traverses the returned group to set renderOrder=-1 and drive the altitude fade, so any mesh added here inherits that contract automatically.

