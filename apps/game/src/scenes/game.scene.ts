import { ArcRotateCamera, Color3, Color4, DirectionalLight, Effect, HemisphericLight, MeshBuilder, Scene, ShaderMaterial, Vector3, type Engine } from "babylonjs";
import { parseMap, TileType } from "../utils/parse-map";
import { createMap } from "../utils/create-map";
import { createBoat } from "../utils/boat";
import { createBoatController } from "../utils/boat-controller";
import mapRaw from "../assets/map.txt?raw";

function createSkybox(scene: Scene) {
    Effect.ShadersStore['skyGradientVertexShader'] = `
        precision highp float;
        attribute vec3 position;
        uniform mat4 worldViewProjection;
        varying vec3 vPosition;
        void main() {
            vPosition = position;
            gl_Position = worldViewProjection * vec4(position, 1.0);
        }
    `;

    Effect.ShadersStore['skyGradientFragmentShader'] = `
        precision highp float;
        varying vec3 vPosition;

        vec3 lerp3(vec3 a, vec3 b, float t) {
            return a + (b - a) * clamp(t, 0.0, 1.0);
        }

        void main() {
            // Normalise Y entre 0 (bas) et 1 (haut)
            float t = (normalize(vPosition).y + 1.0) * 0.5;

            // Palette style Minecraft — bleu clair en haut, horizon lumineux, sombre en bas
            vec3 nadir    = vec3(0.04, 0.06, 0.12);   // 0.0 — sous la scène
            vec3 horizon  = vec3(0.55, 0.75, 0.92);   // 0.5 — horizon clair
            vec3 zenith   = vec3(0.25, 0.47, 0.85);   // 1.0 — ciel bleu vif

            vec3 color;
            if (t < 0.45) {
                color = lerp3(nadir, horizon, t / 0.45);
            } else if (t < 0.55) {
                color = horizon;
            } else {
                color = lerp3(horizon, zenith, (t - 0.55) / 0.45);
            }

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    const sky = MeshBuilder.CreateBox('skybox', { size: 500 }, scene);

    const mat = new ShaderMaterial('skyGradientMat', scene,
        { vertex: 'skyGradient', fragment: 'skyGradient' },
        {
            attributes: ['position'],
            uniforms: ['worldViewProjection'],
        },
    );
    mat.backFaceCulling = false;

    sky.material = mat;
    sky.infiniteDistance = true;

    return sky;
}

export async function createScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.01, 0.02, 0.06, 1);
    scene.ambientColor = new Color3(0.05, 0.08, 0.15);

    const camera = new ArcRotateCamera(
        'camera',
        -Math.PI / 2,
        Math.PI / 3,
        15,
        Vector3.Zero(),
        scene
    );

    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 30;

    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.diffuse = new Color3(0.7, 0.8, 1.0);
    hemi.groundColor = new Color3(0.02, 0.06, 0.15);

    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.3), scene);
    sun.intensity = 0.8;
    sun.diffuse = new Color3(1.0, 0.95, 0.85);
    sun.specular = new Color3(1.0, 0.97, 0.9);

    createSkybox(scene);

    const map = parseMap(mapRaw);
    const { tileMeshes } = createMap(scene, engine, map);

    const firstWater = map.cells.flat().find(c => c.type === TileType.Water);
    if (firstWater) {
        const boat = await createBoat(scene);
        const controller = createBoatController(
            boat, tileMeshes, map,
            firstWater.row, firstWater.col,
            engine, scene,
        );

        scene.onBeforeRenderObservable.add(() => {
            const pos = controller.boat.position;
            camera.setTarget(new Vector3(pos.x, 0, pos.z));
        });
    }

    return scene;
}
