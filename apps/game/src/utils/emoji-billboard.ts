import { DynamicTexture, Mesh, MeshBuilder, StandardMaterial, type Scene } from "babylonjs";

export const EMOJI_CONFIG = {
  TEXTURE_SIZE: 256,
  DEFAULT_PLANE_SIZE: 0.8,
  DEFAULT_RADIUS: 18,
  MIN_SCALE: 0.3,
  MAX_SCALE: 2.5,
  FONT: "180px serif",
} as const;

export function createEmojiBillboard(
  emoji: string,
  name: string,
  scene: Scene,
  planeSize: number = EMOJI_CONFIG.DEFAULT_PLANE_SIZE,
): Mesh {
  const size = EMOJI_CONFIG.TEXTURE_SIZE;
  const tex = new DynamicTexture(`${name}_tex`, size, scene, false);
  const ctx = tex.getContext();

  ctx.clearRect(0, 0, size, size);
  ctx.font = EMOJI_CONFIG.FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2);

  tex.update(/* invertY */ true);
  tex.hasAlpha = true;

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = MeshBuilder.CreatePlane(name, { size: planeSize }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.material = mat;

  return plane;
}

export function computeEmojiScale(cameraRadius: number, baseSize = 1): number {
  const raw = baseSize * (cameraRadius / EMOJI_CONFIG.DEFAULT_RADIUS);
  return Math.min(EMOJI_CONFIG.MAX_SCALE, Math.max(EMOJI_CONFIG.MIN_SCALE, raw));
}
