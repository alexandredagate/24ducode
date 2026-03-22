import {
  Color3, Color4, DynamicTexture, Effect,
  Mesh, MeshBuilder, ParticleSystem,
  ShaderMaterial, SolidParticleSystem, Vector3,
  type Observer, type Scene, type TransformNode,
} from "babylonjs";

/* ------------------------------------------------------------------ */
/*  Wind overlay — cel-shaded / cartoon style                         */
/*  Two layers:                                                       */
/*    1. SolidParticleSystem  → calligraphic wind streaks              */
/*    2. ParticleSystem       → tiny swirling leaf / dust motes        */
/* ------------------------------------------------------------------ */

const STREAK_COUNT = 18;
const LEAF_COUNT = 20;

// Wind blows diagonally (X + Z) for a cross-wind feel
const WIND_DIR = new Vector3(1, 0, 1).normalize();
const WIND_ANGLE = Math.atan2(WIND_DIR.z, WIND_DIR.x); // base Y rotation for streaks
const BASE_SPEED = 2.0;
const GUST_CYCLE = 10.0;       // seconds per gust cycle
const GUST_STRENGTH = 1.5;     // extra speed during gusts
const GUST_EXTRA_RATE = 1.5;   // emit-rate multiplier during gusts

/* ---------- custom shader for calligraphic brush stroke ---------- */

const STREAK_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform mat4 world;

varying vec2 vUV;
varying vec3 vNormal;

void main() {
  vUV = uv;
  vNormal = normalize((world * vec4(normal, 0.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const STREAK_FRAGMENT = `
precision highp float;
varying vec2 vUV;
varying vec3 vNormal;

uniform float opacity;
uniform vec3 tint;   // slight blue-sky tint

void main() {
  // Lengthwise fade: smooth in from left, sharp cut on right (calligraphic)
  float fadeIn  = smoothstep(0.0, 0.35, vUV.x);
  float fadeOut = smoothstep(1.0, 0.6, vUV.x);
  float along   = fadeIn * fadeOut;

  // Cross-section: sharp top edge, feathered bottom (brush feel)
  float cross = smoothstep(0.0, 0.15, vUV.y) * smoothstep(1.0, 0.4, vUV.y);

  float alpha = along * cross * opacity;
  if (alpha < 0.005) discard;

  gl_FragColor = vec4(tint, alpha);
}
`;

/* ---------- helpers ------------------------------------------------ */

interface StreakData {
  speed: number;
  phase: number;        // primary sin wave phase offset
  freq: number;         // primary sin wave frequency
  amp: number;          // primary sin wave amplitude (Y)
  phase2: number;       // secondary wave phase
  freq2: number;        // secondary wave frequency (slower)
  amp2: number;         // secondary wave amplitude (Y)
  zFreq: number;        // lateral (Z) ondulation frequency
  zAmp: number;         // lateral ondulation amplitude
  zPhase: number;       // lateral phase offset
  baseY: number;        // altitude
  length: number;
  resetX: number;       // X offset where it wraps
  opacity: number;
  angleOff: number;     // slight per-streak wind angle offset (radians)
}

function rand(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }

function initStreak(): StreakData {
  return {
    speed: rand(0.6, 1.4),
    phase: rand(0, Math.PI * 2),
    freq: rand(0.6, 2.5),
    amp: rand(0.03, 0.20),
    phase2: rand(0, Math.PI * 2),
    freq2: rand(0.2, 0.7),
    amp2: rand(0.05, 0.35),
    zFreq: rand(0.3, 1.2),
    zAmp: rand(0.1, 0.6),
    zPhase: rand(0, Math.PI * 2),
    baseY: rand(0.4, 3.0),
    length: rand(1.5, 5.0),
    resetX: rand(14, 22),
    opacity: rand(0.08, 0.25),
    angleOff: rand(-0.15, 0.15),
  };
}

/* ================================================================== */
/*  Public API                                                        */
/* ================================================================== */

export interface WindSystem {
  setEnabled(on: boolean): void;
  dispose(): void;
}

export function createWindEffect(
  scene: Scene,
  target: TransformNode,
): WindSystem {
  const engine = scene.getEngine();

  /* ---- register shader once ---- */
  if (!Effect.ShadersStore['windStreakVertexShader']) {
    Effect.ShadersStore['windStreakVertexShader'] = STREAK_VERTEX;
    Effect.ShadersStore['windStreakFragmentShader'] = STREAK_FRAGMENT;
  }

  /* ================ LAYER 1 — wind streaks (SPS) ================== */

  const streakMat = new ShaderMaterial('windStreakMat', scene, 'windStreak', {
    attributes: ['position', 'normal', 'uv'],
    uniforms: ['worldViewProjection', 'world', 'opacity', 'tint'],
    needAlphaBlending: true,
  });
  streakMat.backFaceCulling = false;
  streakMat.setColor3('tint', new Color3(0.92, 0.95, 1.0));
  streakMat.setFloat('opacity', 1.0);
  streakMat.alphaMode = 2; // ALPHA_ADD

  // Thin ribbon-like plane for each streak
  const streakModel = MeshBuilder.CreatePlane('_streakModel', {
    width: 1, height: 0.04, sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  streakModel.isVisible = false;

  const sps = new SolidParticleSystem('windSPS', scene, { updatable: true });
  sps.addShape(streakModel, STREAK_COUNT);
  const spsMesh = sps.buildMesh();
  spsMesh.material = streakMat;
  spsMesh.hasVertexAlpha = true;
  spsMesh.alwaysSelectAsActiveMesh = true;

  streakModel.dispose();

  // Per-particle data
  const streakData: StreakData[] = [];
  for (let i = 0; i < STREAK_COUNT; i++) {
    streakData.push(initStreak());
  }

  // Perpendicular axis to wind (for lateral spread)
  const PERP_X = -WIND_DIR.z;  // rotated 90°
  const PERP_Z = WIND_DIR.x;

  // Positions are LOCAL to spsMesh which follows the boat.
  // So (0,0,0) = boat position.
  // We scatter along wind axis (parallel) and perp axis (lateral).
  sps.initParticles = () => {
    for (let i = 0; i < sps.nbParticles; i++) {
      const p = sps.particles[i];
      const d = streakData[i];
      const along = rand(-d.resetX, d.resetX);
      const lateral = rand(-8, 8);
      p.position.x = WIND_DIR.x * along + PERP_X * lateral;
      p.position.z = WIND_DIR.z * along + PERP_Z * lateral;
      p.position.y = d.baseY;
      p.scaling.x = d.length;
      p.scaling.y = rand(0.6, 1.5);
    }
  };
  sps.initParticles();
  sps.setParticles();

  let elapsed = 0;

  sps.updateParticle = (p) => {
    const d = streakData[p.idx];
    const gustFactor = 1.0 + GUST_STRENGTH * Math.max(0, Math.sin(elapsed * Math.PI * 2 / GUST_CYCLE));
    const speed = BASE_SPEED * d.speed * gustFactor;
    const dt = scene.getEngine().getDeltaTime() / 1000;

    // Per-streak wind angle (slight variation so they don't all go parallel)
    const totalAngle = WIND_ANGLE + d.angleOff;
    const dirX = Math.cos(totalAngle);
    const dirZ = Math.sin(totalAngle);

    // Move along wind direction (local space — 0,0,0 is the boat)
    p.position.x += dirX * speed * dt;
    p.position.z += dirZ * speed * dt;

    // Vertical ondulation: two layered sin waves for organic motion
    const wave1 = Math.sin(elapsed * d.freq + d.phase) * d.amp;
    const wave2 = Math.sin(elapsed * d.freq2 + d.phase2) * d.amp2;
    p.position.y = d.baseY + wave1 + wave2;

    // Lateral drift: gentle sway perpendicular to wind
    p.position.x += PERP_X * Math.cos(elapsed * d.zFreq + d.zPhase) * d.zAmp * dt;
    p.position.z += PERP_Z * Math.cos(elapsed * d.zFreq + d.zPhase) * d.zAmp * dt;

    // Wrap: project position onto wind axis, reset when past resetX
    const proj = p.position.x * WIND_DIR.x + p.position.z * WIND_DIR.z;
    if (proj > d.resetX) {
      const lateral = rand(-8, 8);
      p.position.x = WIND_DIR.x * (-d.resetX + rand(-2, 2)) + PERP_X * lateral;
      p.position.z = WIND_DIR.z * (-d.resetX + rand(-2, 2)) + PERP_Z * lateral;
      Object.assign(d, initStreak());
      p.scaling.x = d.length;
      p.scaling.y = rand(0.6, 1.5);
    }

    // Orient plane along wind direction + per-streak offset
    p.rotation.x = 0;
    p.rotation.y = -(WIND_ANGLE + d.angleOff);
    p.rotation.z = 0;

    // Per-streak opacity with slow pulsing
    const alpha = d.opacity * (0.7 + 0.3 * Math.sin(elapsed * 0.5 + d.phase));
    p.color = new Color4(1, 1, 1, alpha);

    return p;
  };

  /* ================ LAYER 2 — swirling leaf motes ================= */

  const leafTex = new DynamicTexture('leafTex', 64, scene, false);
  const lctx = leafTex.getContext();
  lctx.clearRect(0, 0, 64, 64);
  // Small elongated ellipse — leaf-like
  lctx.save();
  lctx.translate(32, 32);
  lctx.scale(1, 0.4);
  lctx.beginPath();
  lctx.arc(0, 0, 24, 0, Math.PI * 2);
  lctx.restore();
  const lg = lctx.createRadialGradient(32, 32, 0, 32, 32, 28);
  lg.addColorStop(0, 'rgba(245,250,240,0.9)');
  lg.addColorStop(0.6, 'rgba(220,240,210,0.5)');
  lg.addColorStop(1, 'rgba(200,230,190,0)');
  lctx.fillStyle = lg;
  lctx.fill();
  leafTex.update(false);
  leafTex.hasAlpha = true;

  const leafEmitPos = target.position.clone();
  const leaves = new ParticleSystem('windLeaves', LEAF_COUNT, scene);
  leaves.particleTexture = leafTex;
  leaves.emitter = leafEmitPos;
  leaves.minEmitBox = new Vector3(-10, 0.3, -10);
  leaves.maxEmitBox = new Vector3(10, 3.0, 10);

  leaves.direction1 = new Vector3(WIND_DIR.x * 1.0, 0.2, WIND_DIR.z * 1.0 - 0.2);
  leaves.direction2 = new Vector3(WIND_DIR.x * 2.0, 0.6, WIND_DIR.z * 2.0 + 0.4);
  leaves.minEmitPower = 0.3;
  leaves.maxEmitPower = 0.8;

  leaves.minSize = 0.03;
  leaves.maxSize = 0.10;
  leaves.minLifeTime = 2.5;
  leaves.maxLifeTime = 5.0;
  leaves.emitRate = 5;

  leaves.color1 = new Color4(1, 1, 0.95, 0.30);
  leaves.color2 = new Color4(0.85, 1, 0.8, 0.20);
  leaves.colorDead = new Color4(1, 1, 1, 0);

  // Spiral: angular speed + gentle gravity pulls them in arcs
  leaves.minAngularSpeed = 0.8;
  leaves.maxAngularSpeed = 2.5;
  leaves.gravity = new Vector3(0.3, -0.15, 0.1);

  leaves.blendMode = ParticleSystem.BLENDMODE_ADD;
  leaves.isBillboardBased = true;

  leaves.start();

  /* ================ render loop ==================================== */

  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    elapsed += dt;

    // Gust modulation on leaf emit rate
    const gustNorm = Math.max(0, Math.sin(elapsed * Math.PI * 2 / GUST_CYCLE));
    leaves.emitRate = 5 + Math.round(gustNorm * GUST_EXTRA_RATE * 5);

    // Keep SPS centred on target (streaks wrap around it)
    spsMesh.position.copyFrom(target.position);
    spsMesh.position.y = 0;

    // Sync leaf emitter
    leafEmitPos.copyFrom(target.position);

    // Update streak shader opacity for gust pulse
    streakMat.setFloat('opacity', 0.8 + gustNorm * 0.2);

    sps.setParticles();
  })!;

  /* ================ public handle ================================== */

  let enabled = true;

  return {
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      spsMesh.setEnabled(on);
      if (on) leaves.start(); else leaves.stop();
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(obs);
      spsMesh.dispose();
      sps.dispose();
      streakMat.dispose();
      leaves.stop();
      leaves.dispose();
      leafTex.dispose();
    },
  };
}
