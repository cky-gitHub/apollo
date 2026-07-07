import * as THREE from 'three'

// Rough placeholder pad: concrete apron + a simple blocky launch platform and
// flame-deflector mount under the rocket. No gantry/tower yet — that's a
// separate, later pass. The rocket itself is never repositioned for this;
// the platform's top surface sits at y=0 (the rocket's own resting height),
// so the mount reads as scaffolding under the rocket rather than something
// it needs to be lifted onto.
const APRON_RADIUS = 3000
const PLATFORM_SIZE = 34
const PLATFORM_HEIGHT = 3
const MOUNT_SIZE = 15
const MOUNT_HEIGHT = 4.5
const DEFLECTOR_SIZE = 9

export function buildLaunchPad() {
  const group = new THREE.Group()
  group.name = 'launch-pad'

  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(APRON_RADIUS, 48),
    new THREE.MeshStandardMaterial({ color: 0x8c8c86, roughness: 0.95, metalness: 0.05 }),
  )
  apron.rotation.x = -Math.PI / 2
  apron.position.y = -0.05
  group.add(apron)

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_SIZE, PLATFORM_HEIGHT, PLATFORM_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x5b5b57, roughness: 0.85, metalness: 0.15 }),
  )
  platform.position.y = -PLATFORM_HEIGHT / 2
  group.add(platform)

  const mount = new THREE.Mesh(
    new THREE.BoxGeometry(MOUNT_SIZE, MOUNT_HEIGHT, MOUNT_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.75, metalness: 0.25 }),
  )
  mount.position.y = -PLATFORM_HEIGHT - MOUNT_HEIGHT / 2
  group.add(mount)

  // Scorched flame-deflector cap, flush with the platform top, under the engines.
  const deflector = new THREE.Mesh(
    new THREE.CylinderGeometry(DEFLECTOR_SIZE / 2, DEFLECTOR_SIZE / 2, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 }),
  )
  deflector.position.y = 0.02
  group.add(deflector)

  return group
}
