import * as THREE from "three";

// Procedural motion for JD (a VRM), driven every frame so no animation clips ship with the model.
// Layers: breathing, weight shift and head drift always run; a mood changes the base posture; a move
// (greet, thumbsup, ...) fades in and out on top. Every bone eases toward its target, so nothing snaps.
// scorn, sideeye, thumbsup and fistpump are JD's celebrations, one per attitude tier (see jdvoice.js).
export const MOVES = { greet: 2.4, sad: 2.4, nod: 1.2, scorn: 2.6, sideeye: 2.6, thumbsup: 2.6, fistpump: 2.2 }; // seconds
const MOODS = {
  normal: { head: 0, lean: 0, droop: 0, breath: 1.6, sad: 0 },
  tired: { head: 0.2, lean: 0.1, droop: 0.07, breath: 1.0, sad: 0.25 },
  injured: { head: 0.26, lean: 0.16, droop: 0.1, breath: 1.2, sad: 0.55 },
};
const REST_ARM = 1.36; // rad around z: the VRM rest pose is a T-pose, so this swings an arm down
const BONES = [
  "hips", "spine", "chest", "neck", "head", "leftShoulder", "rightShoulder",
  "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftHand", "rightHand", "leftUpperLeg", "rightUpperLeg",
];
// Fingers curl about z: toward the palm is +z on the right hand and -z on the left.
const FINGERS = ["left", "right"].flatMap((side) =>
  ["Index", "Middle", "Ring", "Little"].flatMap((finger) =>
    ["Proximal", "Intermediate", "Distal"].map((joint, i) => ({ name: `${side}${finger}${joint}`, side, finger, joint: i })),
  ),
);
const CURL = [1.3, 1.5, 0.9]; // a closed fist, per joint
const SOFT = [0.25, 0.3, 0.15]; // relaxed fingers

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, w) => a + (b - a) * w;

export function createPoser(vrm, moodName = "normal") {
  const mood = MOODS[moodName] || MOODS.normal;
  const bones = {};
  const cur = {};
  for (const name of [...BONES, ...FINGERS.map((f) => f.name)]) {
    bones[name] = vrm.humanoid.getNormalizedBoneNode(name);
    cur[name] = [0, 0, 0];
  }
  const hipsBase = bones.hips.position.clone(); // the hips carry the model's standing height
  const curHips = [0, 0];
  const expr = vrm.expressionManager;
  let move = null;
  let time = Math.random() * 10; // two mounts shouldn't breathe in step
  let happy = 0;
  let relaxed = 0;

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
    const sad = on("sad");
    const nod = on("nod");
    const scorn = on("scorn");
    const sideeye = on("sideeye");
    const thumbsup = on("thumbsup");
    const fistpump = on("fistpump");
    const fist = Math.max(thumbsup, fistpump);
    const t = time;
    const breath = Math.sin(t * mood.breath);
    const sway = Math.sin(t * 0.55);
    const bounce = Math.abs(Math.sin(t * 8));

    const T = Object.fromEntries([...BONES, ...FINGERS.map((f) => f.name)].map((name) => [name, [0, 0, 0]]));
    const add = (name, x = 0, y = 0, z = 0) => {
      T[name][0] += x;
      T[name][1] += y;
      T[name][2] += z;
    };

    // posture and breathing
    add("spine", mood.lean * 0.5 + sad * 0.18 + breath * 0.015, Math.sin(t * 0.37) * 0.05, -sway * 0.035);
    add("chest", mood.lean * 0.5 + breath * 0.035 + sad * 0.06 - scorn * 0.06, Math.sin(t * 0.37) * 0.06 - greet * 0.1 - sideeye * 0.15, -sway * 0.02);
    add("hips", 0, 0, sway * 0.05 + scorn * 0.04);
    add("leftShoulder", 0, 0, breath * 0.04 - mood.droop - sad * 0.08);
    add("rightShoulder", 0, 0, -breath * 0.04 + mood.droop + sad * 0.08);
    add("leftUpperLeg", 0, 0, sway * 0.03);
    add("rightUpperLeg", 0, 0, sway * 0.03);

    // head: slow drift, then follow the cursor, then the move. Side-eye turns the head away and the eyes keep tracking the camera.
    const headX = mood.head + Math.sin(t * 0.8) * 0.05 + Math.sin(t * 1.9) * 0.02 + sad * 0.42 - scorn * 0.22 + sideeye * 0.04 + look.y * 0.3 + Math.sin(t * 9) * 0.22 * nod;
    const headY = Math.sin(t * 0.45) * 0.16 + Math.sin(t * 1.1) * 0.04 + look.x * 0.45 - sideeye * 0.6;
    const headZ = sway * 0.012 + greet * 0.07 + scorn * 0.07 - sideeye * 0.04;
    add("neck", headX * 0.4, headY * 0.4, headZ * 0.4);
    add("head", headX * 0.6, headY * 0.6, headZ * 0.6);

    // arms: relaxed with a soft elbow bend; the right arm blends toward the move's pose (only one move is ever active)
    const hang = REST_ARM + mood.droop + sad * 0.1 + breath * 0.008;
    const toward = (rest, ...pairs) => pairs.reduce((value, [weight, target]) => value + weight * (target - rest), rest);
    add("leftUpperArm", 0, -0.08, -hang);
    add("leftLowerArm", 0, -0.3 - Math.sin(t * 0.9) * 0.02, 0);
    add("rightUpperArm", 0, 0.08 + thumbsup * 0.35, toward(hang, [greet, -0.3], [fistpump, -0.8]));
    add("rightLowerArm", -thumbsup * 1.3, 0.3 + Math.sin(t * 0.9 + 1) * 0.02 - greet * 0.2 + thumbsup * 1.6 + fistpump * 0.6, -greet * (1.15 + Math.sin(t * 11) * 0.3) - fistpump * (0.9 + Math.sin(t * 9) * 0.3));
    for (const { name, side, finger, joint } of FINGERS) {
      const curl = side === "right" ? mix(SOFT[joint], CURL[joint], fist) : SOFT[joint];
      add(name, 0, 0, (side === "right" ? 1 : -1) * (curl + (finger === "Index" ? 0 : 0.04)));
    }

    const ease = snap ? 1 : 1 - Math.exp(-12 * dt);
    for (const name in T) {
      const bone = bones[name];
      if (!bone) continue;
      for (let i = 0; i < 3; i++) cur[name][i] += (T[name][i] - cur[name][i]) * ease;
      bone.rotation.set(cur[name][0], cur[name][1], cur[name][2]);
    }
    const hipsTarget = [sway * 0.03, bounce * 0.03 * fistpump - sad * 0.015];
    curHips[0] += (hipsTarget[0] - curHips[0]) * ease;
    curHips[1] += (hipsTarget[1] - curHips[1]) * ease;
    bones.hips.position.set(hipsBase.x + curHips[0], hipsBase.y + curHips[1], hipsBase.z);

    // face: a soft blink every few seconds; scorn and side-eye half-close the lids
    const phase = (t % 3.7) / 0.18;
    const blink = phase < 1 ? 1 - Math.abs(phase * 2 - 1) : 0;
    happy += ((greet * 0.8 + nod * 0.3 + thumbsup * 0.6 + fistpump) - happy) * ease;
    relaxed += ((sideeye * 0.5 + scorn * 0.3) - relaxed) * ease;
    if (expr) {
      expr.setValue("blink", Math.max(blink, scorn * 0.5 + sideeye * 0.25));
      expr.setValue("happy", happy);
      expr.setValue("relaxed", relaxed);
      expr.setValue("sad", Math.max(mood.sad, sad * 0.8));
    }
  };

  update(0, undefined, true);
  return { play, update };
}
