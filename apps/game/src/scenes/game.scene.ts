import { ArcRotateCamera, Color3, Color4, DirectionalLight, Effect, HemisphericLight, MeshBuilder, Scene, ShaderMaterial, Vector3, type Engine } from "babylonjs";
import { parseMap, TileType } from "../utils/parse-map";
import { createMap } from "../utils/create-map";
import { createBoat } from "../utils/boat";
import { createBoatController } from "../utils/boat-controller";
import mapRaw from "../assets/map.txt?raw";
import {
    connect, requestMapGrid, onMapUpdate, onBrokerEvent, onShipPosition,
    login, buildShip, getShipLocation, getShipNextLevel,
    getMapMeta, type MapMeta,
} from "../services/socket";
import { serverGridToGameMap, serverToGrid } from "../services/map-converter";

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
            float t = (normalize(vPosition).y + 1.0) * 0.5;

            vec3 nadir    = vec3(0.04, 0.06, 0.12);
            vec3 horizon  = vec3(0.55, 0.75, 0.92);
            vec3 zenith   = vec3(0.25, 0.47, 0.85);

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

async function authenticatePlayer(): Promise<boolean> {
    const stored = localStorage.getItem('codingGameId');
    const codingGameId = stored || window.prompt('Enter your codingGameId:');
    if (!codingGameId) return false;

    try {
        await login(codingGameId);
        localStorage.setItem('codingGameId', codingGameId);
        console.log('[game] authenticated');
        return true;
    } catch (err) {
        console.error('[game] login failed:', err);
        localStorage.removeItem('codingGameId');
        return false;
    }
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

    // ─── Connect & authenticate ──────────────────────
    let serverAvailable = false;
    let map;

    try {
        connect();
        const authenticated = await authenticatePlayer();
        if (!authenticated) {
            console.warn('[game] not authenticated, using static map');
        } else {
            serverAvailable = true;
        }

        const gridData = await requestMapGrid();
        map = serverGridToGameMap(gridData);
        console.log('[game] server map loaded:', map.cols, 'x', map.rows);
    } catch (err) {
        console.warn('[game] server unavailable, using static fallback', err);
        map = parseMap(mapRaw);
    }

    let currentMapResult = createMap(scene, engine, map);
    let currentMeta: MapMeta | null = getMapMeta();

    // ─── Listen for server broadcasts ────────────────
    onBrokerEvent((data) => {
        console.log('[game] broker:event', data);
    });

    // ─── Resolve boat start position ─────────────────
    let startRow: number | null = null;
    let startCol: number | null = null;

    if (serverAvailable && currentMeta) {
        // Strategy 1: ship:location (cached position from MongoDB — fast, no external API call)
        try {
            const location = await getShipLocation();
            const pos = serverToGrid(location.position.x, location.position.y, currentMeta);
            startRow = pos.row;
            startCol = pos.col;
            console.log('[game] ship position from ship:location:', startRow, startCol);
        } catch {
            console.log('[game] no cached ship:location');
        }

        // Strategy 2: ship:next-level (calls external game API — has currentPosition)
        if (startRow === null) {
            try {
                const ship = await getShipNextLevel();
                const pos = serverToGrid(ship.currentPosition.x, ship.currentPosition.y, currentMeta);
                startRow = pos.row;
                startCol = pos.col;
                console.log('[game] ship position from ship:next-level:', startRow, startCol);
            } catch {
                console.log('[game] no ship exists yet');
            }
        }

        // Strategy 3: build a new ship
        if (startRow === null) {
            try {
                console.log('[game] building ship...');
                await buildShip();
                const ship = await getShipNextLevel();
                const pos = serverToGrid(ship.currentPosition.x, ship.currentPosition.y, currentMeta);
                startRow = pos.row;
                startCol = pos.col;
                console.log('[game] ship built, position:', startRow, startCol);
            } catch (err) {
                console.warn('[game] could not build ship:', err);
            }
        }
    }

    // Fallback: first water tile in the map
    if (startRow === null || startCol === null) {
        const firstWater = map.cells.flat().find(c => c.type === TileType.Water);
        if (firstWater) {
            startRow = firstWater.row;
            startCol = firstWater.col;
            console.log('[game] fallback: first water tile at', startRow, startCol);
        }
    }

    if (startRow !== null && startCol !== null) {
        const boat = await createBoat(scene);
        const controller = createBoatController(
            boat, currentMapResult.tileMeshes, map,
            startRow, startCol,
            engine, scene,
            currentMeta,
        );

        // Rebuild map when server broadcasts map:update
        onMapUpdate((gridData) => {
            console.log('[game] map:update — rebuilding', gridData.width, 'x', gridData.height);
            currentMapResult.dispose();
            const newMap = serverGridToGameMap(gridData);
            currentMapResult = createMap(scene, engine, newMap);
            currentMeta = { minX: gridData.minX, maxX: gridData.maxX, minY: gridData.minY, maxY: gridData.maxY };
            controller.updateMap(newMap, currentMapResult.tileMeshes, currentMeta);
        });

        // Move boat when server broadcasts ship:position
        onShipPosition((data) => {
            if (currentMeta) {
                const pos = serverToGrid(data.position.x, data.position.y, currentMeta);
                controller.setPosition(pos.row, pos.col);
            }
        });

        scene.onBeforeRenderObservable.add(() => {
            const pos = controller.boat.position;
            camera.setTarget(new Vector3(pos.x, 0, pos.z));
        });
    }

    return scene;
}
