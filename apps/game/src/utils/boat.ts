import { type AbstractMesh, Color3, SceneLoader, StandardMaterial, TransformNode, Vector3, type Scene } from "babylonjs";
import "babylonjs-loaders";
import shipUrl from "../assets/ship.glb?url";

const TILE_SIZE = 1.0;

const MESH_COLORS: { pattern: RegExp; diffuse: Color3; emissive?: Color3; specular?: Color3 }[] = [
  { pattern: /sail|voile|cloth|fabric/i,   diffuse: new Color3(0.95, 0.92, 0.85), emissive: new Color3(0.08, 0.07, 0.05) },
  { pattern: /hull|coque|body|boat|ship/i, diffuse: new Color3(0.45, 0.22, 0.10), emissive: new Color3(0.04, 0.02, 0.01), specular: new Color3(0.15, 0.1, 0.05) },
  { pattern: /mast|mat|pole|stick/i,       diffuse: new Color3(0.55, 0.35, 0.18), emissive: new Color3(0.03, 0.02, 0.01) },
  { pattern: /flag|drapeau|banner/i,       diffuse: new Color3(0.85, 0.15, 0.12), emissive: new Color3(0.10, 0.02, 0.01) },
  { pattern: /deck|plank|wood|bois/i,      diffuse: new Color3(0.60, 0.40, 0.20), emissive: new Color3(0.04, 0.03, 0.01) },
  { pattern: /window|glass|hublot/i,       diffuse: new Color3(0.5, 0.7, 0.85),   emissive: new Color3(0.05, 0.08, 0.12) },
  { pattern: /metal|iron|cannon/i,         diffuse: new Color3(0.35, 0.35, 0.38),  specular: new Color3(0.4, 0.4, 0.4) },
  { pattern: /rope|cord/i,                 diffuse: new Color3(0.65, 0.55, 0.35) },
];

const DEFAULT_DIFFUSE  = new Color3(0.50, 0.28, 0.12);
const DEFAULT_EMISSIVE = new Color3(0.03, 0.02, 0.01);

function applyBoatMaterials(meshes: AbstractMesh[], scene: Scene) {
  const cache = new Map<string, StandardMaterial>();

  for (const mesh of meshes) {
    if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) continue;

    const name = mesh.name.toLowerCase() + (mesh.material?.name?.toLowerCase() ?? '');
    const match = MESH_COLORS.find(mc => mc.pattern.test(name));

    const key = match ? match.pattern.source : '__default__';
    let mat = cache.get(key);

    if (!mat) {
      mat = new StandardMaterial(`boatMat_${key}`, scene);
      if (match) {
        mat.diffuseColor = match.diffuse;
        mat.emissiveColor = match.emissive ?? Color3.Black();
        mat.specularColor = match.specular ?? new Color3(0.1, 0.1, 0.1);
      } else {
        mat.diffuseColor = DEFAULT_DIFFUSE;
        mat.emissiveColor = DEFAULT_EMISSIVE;
        mat.specularColor = new Color3(0.1, 0.08, 0.05);
      }
      mat.specularPower = 32;
      mat.backFaceCulling = false;
      cache.set(key, mat);
    }

    mesh.material = mat;
  }
}

export async function createBoat(scene: Scene): Promise<TransformNode> {
  const result = await SceneLoader.ImportMeshAsync("", "", shipUrl, scene);

  const root = result.meshes[0];

  applyBoatMaterials(result.meshes, scene);

  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of result.meshes) {
    const bb = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bb.minimumWorld);
    max = Vector3.Maximize(max, bb.maximumWorld);
  }

  const size = max.subtract(min);
  const maxExtent = Math.max(size.x, size.z);
  const scaleFactor = (TILE_SIZE * 1) / maxExtent;
  root.scaling.scaleInPlace(scaleFactor);

  const pivot = new TransformNode('boatPivot', scene);
  root.parent = pivot;

  return pivot;
}
