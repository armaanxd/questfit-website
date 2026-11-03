import * as THREE from "three";

// Procedural motion for JD (a VRM), driven every frame so no animation clips ship with the model.
// Layers: breathing, weight shift and head drift always run; a mood changes the base posture; a move
// (greet, cheer, ...) fades in and out on top. Every bone eases toward its target, so nothing snaps.
export const MOVES = { greet: 2.4, cheer: 1.9, sad: 2.4, nod: 1.2, dance: 3.2 }; // seconds
const MOODS = {
  normal: { head: 0, lean: 0, droop: 0, breath: 1.6, sad: 0 },
  tired: { head: 0.2, lean: 0.1, droop: 0.07, breath: 1.0, sad: 0.25 },
  injured: { head: 0.26, lean: 0.16, droop: 0.1, breath: 1.2, sad: 0.55 },
};
const REST_ARM = 1.36; // rad around z: the VRM rest pose is a T-pose, so this swings an arm down
const BONES = [
  "hips", "spine", "chest", "neck", "head", "leftShoulder", "rightShoulder",
  "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg",
];

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, w) => a + (b - a) * w;

export function createPoser(vrm, moodName = "normal") {
  const mood = MOODS[moodName] || MOODS.normal;
  const bones = {};
  const cur = {};
  for (const name of BONES) {
    bones[name] = vrm.humanoid.getNormalizedBoneNode(name);
    cur[name] = [0, 0, 0];
  }
  const hipsBase = bones.hips.position.clone(); // the hips carry the model's standing height
  const curHips = [0, 0];
  const expr = vrm.expressionManager;
  let move = null;
  let time = Math.random() * 10; // two mounts shouldn't breathe in step
  let happy = 0;

  const play = (name) => {
    if (MOVES[name]) move = { name, t: 0 };
    return !!MOVES[name];
  };

  // look.x / look.y run -1..1 (where the cursor is); snap jumps straight to the target pose.
  const update = (dt, look = { x: 0, y: 0 }, snap = false) => {
    time += dt;
    if (move && (move.t += dt) > MOVES[move.name]) move = null;
    const p = move ? move.t / MOVES[move.name] : 0;
    const e = move ? smooth(0, 0.2, p) * (1 - smooth(0.78, 1, p)) : 0;
    const on = (name) => (move?.name === name ? e : 0);
    const greet = on("greet");
    const cheer = on("cheer");
    const sad = on("sad");
    const nod = on("nod");
    const dance = on("dance");
    const t = time;
    const breath = Math.sin(t * mood.breath);
    const sway = Math.sin(t * 0.55);
    const beat = Math.sin(t * 7);
    const bounce = Math.abs(Math.sin(t * 7));

    const T = Object.fromEntries(BONES.map((name) => [name, [0, 0, 0]]));
    const add = (name, x = 0, y = 0, z = 0) => {
      T[name][0] += x;
      T[name][1] += y;
      T[name][2] += z;
    };

    // posture and breathing
    add("spine", mood.lean * 0.5 + sad * 0.18 - cheer * 0.06 + breath * 0.008, dance * Math.sin(t * 3.5) * 0.12, -sway * 0.015 - beat * 0.07 * dance);
    add("chest", mood.lean * 0.5 + breath * 0.018 + sad * 0.06, dance * Math.sin(t * 3.5) * 0.15 + greet * -0.1, -sway * 0.01);
    add("hips", 0, -dance * Math.sin(t * 3.5) * 0.1, sway * 0.022 + beat * 0.09 * dance);
    add("leftShoulder", 0, 0, breath * 0.02 - mood.droop - sad * 0.08);
    add("rightShoulder", 0, 0, -breath * 0.02 + mood.droop + sad * 0.08);
    add("leftUpperLeg", 0, 0, sway * 0.012);
    add("rightUpperLeg", 0, 0, sway * 0.012);

    // head: slow drift, then follow the cursor, then the move
    const lookX = look.x * 0.45;
    const lookY = look.y * 0.3;
    const headX = mood.head + Math.sin(t * 0.8) * 0.025 + Math.sin(t * 1.9) * 0.01 + sad * 0.42 - cheer * 0.18 + lookY + Math.sin(t * 9) * 0.22 * nod;
    const headY = Math.sin(t * 0.45) * 0.07 + lookX;
    const headZ = sway * 0.012 + greet * 0.07 + beat * 0.1 * dance;
    add("neck", headX * 0.4, headY * 0.4, headZ * 0.4);
    add("head", headX * 0.6, headY * 0.6, headZ * 0.6);

    // arms: relaxed with a soft elbow bend, blended toward the move's pose (only one move is ever active)
    const hang = REST_ARM + mood.droop + sad * 0.1 + breath * 0.008;
    const toward = (rest, ...pairs) => pairs.reduce((value, [weight, target]) => value + weight * (target - rest), rest);
    add("leftUpperArm", 0, mix(-0.08, -0.15, cheer), toward(-hang, [cheer, 1.3 + Math.sin(t * 10) * 0.12], [dance, 1.0 + 0.7 * beat]));
    add("rightUpperArm", 0, mix(0.08, 0.15, cheer), toward(hang, [cheer, -1.3 + Math.sin(t * 10) * 0.12], [greet, -0.3], [dance, -1.0 + 0.7 * beat]));
    add("leftLowerArm", 0, -0.3 - Math.sin(t * 0.9) * 0.02 - (cheer + dance) * 0.5, 0);
    add("rightLowerArm", 0, 0.3 + Math.sin(t * 0.9 + 1) * 0.02 + (cheer + dance) * 0.5 - greet * 0.2, -greet * (1.15 + Math.sin(t * 11) * 0.3));

    const ease = snap ? 1 : 1 - Math.exp(-12 * dt);
    for (const name of BONES) {
      const bone = bones[name];
      if (!bone) continue;
      for (let i = 0; i < 3; i++) cur[name][i] += (T[name][i] - cur[name][i]) * ease;
      bone.rotation.set(cur[name][0], cur[name][1], cur[name][2]);
    }
    const hipsTarget = [sway * 0.012, (bounce * 0.035 * cheer) + (bounce * 0.03 * dance) - sad * 0.015];
    curHips[0] += (hipsTarget[0] - curHips[0]) * ease;
    curHips[1] += (hipsTarget[1] - curHips[1]) * ease;
    bones.hips.position.set(hipsBase.x + curHips[0], hipsBase.y + curHips[1], hipsBase.z);

    // face: a soft blink every few seconds, plus the move's mood
    const phase = (t % 3.7) / 0.18;
    const blink = phase < 1 ? 1 - Math.abs(phase * 2 - 1) : 0;
    happy += ((Math.max(greet, cheer, dance) * 0.8 + nod * 0.3) - happy) * ease;
    if (expr) {
      expr.setValue("blink", blink);
      expr.setValue("happy", happy);
      expr.setValue("sad", Math.max(mood.sad, sad * 0.8));
    }
  };

  update(0, undefined, true);
  return { play, update };
}
