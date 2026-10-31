/* Spaceship — a small crewed shuttle shared by the space simulators.
 *
 * Built from primitives (offline-safe): lifting-body fuselage, glass cockpit,
 * delta wings, twin tail fins, two ion engines whose plumes stretch and
 * brighten with thrust, RCS quads, and standard navigation lights (red port,
 * green starboard, white strobe). EnvSim flies it in true 3D (flight: true).
 */
import * as THREE from 'three';
import type { EnvVehicle, EnvVehicleDef } from '../EnvSim';

function buildShip(home: { x: number; y: number; z: number }) {
  return (scene: THREE.Scene): EnvVehicle => {
    const g = new THREE.Group();
    const hullM = new THREE.MeshStandardMaterial({ color: 0xe9edf3, roughness: 0.35, metalness: 0.35 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5, metalness: 0.6 });
    const accentM = new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, emissive: 0x0a4a58, emissiveIntensity: 0.6 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x0b2238, roughness: 0.05, metalness: 0.9, emissive: 0x0a2840, emissiveIntensity: 0.4 });

    // Fuselage along +z (nose forward).
    const bodyGeo = new THREE.CapsuleGeometry(2.4, 11, 8, 16);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, hullM);
    body.scale.set(1, 0.72, 1);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 10), darkM); // heat-shield tiles
    belly.position.set(0, -1.45, -0.5);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassM);
    cockpit.scale.set(1, 0.75, 1.6);
    cockpit.position.set(0, 0.9, 3.6);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.25, 7), accentM);
    stripe.position.set(0, 0.1, -0.5);
    g.add(body, belly, cockpit, stripe);

    // Delta wings.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 3);
    wingShape.lineTo(8, -4.5);
    wingShape.lineTo(7.4, -5.6);
    wingShape.lineTo(0, -5);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.35, bevelEnabled: false });
    wingGeo.rotateX(-Math.PI / 2);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, hullM);
      wing.scale.x = sx;
      wing.position.set(sx * 1.6, -0.5, -0.6);
      g.add(wing);
      // Twin canted tail fins.
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 3), hullM);
      fin.position.set(sx * 1.6, 1.9, -5.4);
      fin.rotation.z = sx * -0.35;
      g.add(fin);
      // RCS thruster quads on the nose.
      const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), darkM);
      rcs.position.set(sx * 2.1, 0.2, 5.5);
      g.add(rcs);
    }

    // Engines + plumes.
    const plumeM = new THREE.MeshBasicMaterial({
      color: 0x7fd8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coreM = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const plumes: THREE.Mesh[] = [];
    for (const sx of [-1.4, 1.4]) {
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 3.2, 16), darkM);
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(sx, -0.1, -7.6);
      const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), coreM);
      nozzle.position.set(sx, -0.1, -9.25);
      nozzle.rotation.y = Math.PI;
      const plumeGeo = new THREE.ConeGeometry(0.85, 1, 16, 1, true);
      plumeGeo.translate(0, -0.5, 0);
      plumeGeo.rotateX(Math.PI / 2);   // cone points backwards (−z)
      const plume = new THREE.Mesh(plumeGeo, plumeM);
      plume.position.set(sx, -0.1, -9.2);
      plumes.push(plume);
      g.add(nacelle, nozzle, plume);
    }

    // Navigation lights: red port (left), green starboard (right), white strobe.
    const nav = (color: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    nav(0xff3344, 9.4, -0.3, -5.6);  // +x is port when the nose points +z
    nav(0x33ff77, -9.4, -0.3, -5.6);
    const strobe = nav(0xffffff, 0, 1.6, -6.6);

    // Landing struts (only meaningful on the Moon, harmless in space).
    for (const [x, z] of [[-2, 3], [2, 3], [0, -4]] as const) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 6), darkM);
      strut.position.set(x, -2.3, z);
      g.add(strut);
    }

    g.position.set(home.x, home.y, home.z);
    scene.add(g);

    let tick = 0;
    return {
      group: g,
      prop: null,
      home,
      thrust: (k, dt) => {
        tick += dt;
        const len = 1.2 + k * 9 + Math.sin(tick * 40) * 0.25 * k;
        for (const p of plumes) {
          p.scale.set(0.8 + k * 0.4, 0.8 + k * 0.4, len);
          (p.material as THREE.MeshBasicMaterial).opacity = 0.25 + k * 0.6;
        }
        strobe.visible = tick % 1.2 < 0.08;
      },
    };
  };
}

/** A flyable shuttle parked at `home`. */
export function spaceshipDef(home: { x: number; y: number; z: number }): EnvVehicleDef {
  return {
    label: 'Spaceship',
    icon: 'rocket',
    speed: 34,
    boostSpeed: 80,
    flight: true,
    hideRider: true,
    camDist: 34,
    boardRange: 16,
    hint: 'Float to the shuttle, press E or Ride — the stick steers, aim the nose with the camera to climb or dive, hold Rise to climb, Run boosts.',
    build: buildShip(home),
  };
}
