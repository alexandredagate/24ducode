import { ArcRotateCamera, Color3, Color4, CubeTexture, DirectionalLight, GlowLayer, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, type Engine } from "babylonjs";
import { TileType, clipMapToCircle } from "../utils/parse-map";
import { createMap } from "../utils/create-map";
import { createBoat } from "../utils/boat";
import { createWindEffect } from "../utils/wind";
import { createBoatController } from "../utils/boat-controller";
import {
    connect, requestMapGrid, onMapUpdate, onBrokerEvent, onShipPosition,
    login, buildShip, getShipLocation, getShipNextLevel,
    type MapMeta,
} from "../services/socket";
import { serverGridToGameMap, serverToGrid, buildConfirmedSet } from "../services/map-converter";

import skyboxPx from "../assets/skybox/px.png?url";
import skyboxPy from "../assets/skybox/py.png?url";
import skyboxPz from "../assets/skybox/pz.png?url";
import skyboxNx from "../assets/skybox/nx.png?url";
import skyboxNy from "../assets/skybox/ny.png?url";
import skyboxNz from "../assets/skybox/nz.png?url";

const CODING_GAME_ID = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjb2RpbmdnYW1lIiwic3ViIjoiNDEwYzhiNjQtOTEzZi00NmViLThiYzAtN2ExOTdjNGY1MDZkIiwicm9sZXMiOlsiVVNFUiJdfQ.hnkPxnsdQQFmwnggFKWfDRq5PPQrQ2wBkeqAYIFQklw';

async function authenticatePlayer(): Promise<boolean> {
    try {
        await login(CODING_GAME_ID);
        return true;
    } catch (err) {
        console.error('[game] login failed:', err);
        return false;
    }
}

export async function createScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
    const scene = new Scene(engine);
    scene.ambientColor = new Color3(0.05, 0.08, 0.15);
    scene.clearColor = new Color4(0.04, 0.08, 0.16, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.012;
    scene.fogColor = new Color3(0.15, 0.25, 0.45);

    const camera = new ArcRotateCamera(
        'camera',
        -Math.PI / 2,
        Math.PI / 3.5,
        6,
        Vector3.Zero(),
        scene
    );

    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 20;
    camera.minZ = 0.1;
    camera.maxZ = 180;

    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];
    camera.lowerBetaLimit = 0.2;
    camera.upperBetaLimit = Math.PI / 2.2;

    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
    sun.intensity = 1.2;
    sun.diffuse = new Color3(1.0, 0.95, 0.85);
    sun.specular = new Color3(1.0, 0.97, 0.9);

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.35;
    ambient.diffuse = new Color3(0.6, 0.7, 0.9);
    ambient.groundColor = new Color3(0.2, 0.25, 0.3);

    const fill = new HemisphericLight('fill', new Vector3(0, -1, 0), scene);
    fill.intensity = 0.25;
    fill.diffuse = new Color3(0.8, 0.65, 0.40);
    fill.groundColor = new Color3(0.5, 0.40, 0.25);

    const glow = new GlowLayer('glow', scene, { mainTextureSamples: 4 });
    glow.intensity = 0.4;

    const shadowGen = new ShadowGenerator(1024, sun);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 16;
    shadowGen.darkness = 0.4;

    const skybox = MeshBuilder.CreateBox('skybox', { size: 150 }, scene);
    const skyMat = new StandardMaterial('skyboxMat', scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.reflectionTexture = CubeTexture.CreateFromImages(
        [skyboxPx, skyboxPy, skyboxPz, skyboxNx, skyboxNy, skyboxNz],
        scene,
    );
    skyMat.reflectionTexture!.coordinatesMode = Texture.SKYBOX_MODE;
    skybox.material = skyMat;
    skybox.infiniteDistance = true;

    let serverAvailable = false;
    let map;

    let gridData;
    try {
        await connect();
        const authenticated = await authenticatePlayer();
        if (authenticated) {
            serverAvailable = true;
        }

        gridData = await requestMapGrid();
        map = serverGridToGameMap(gridData);
    } catch (err) {
        throw err;
    }

    const initialMeta: MapMeta = { minX: gridData.minX, maxX: gridData.maxX, minY: gridData.minY, maxY: gridData.maxY };
    const initialConfirmed = buildConfirmedSet(gridData.confirmedRefuel, initialMeta);
    const VIEW_RADIUS = 32; // 64x64 circular viewport
    let fullMap = map; // keep the full unclipped map for re-clipping
    // Initial map with center clip — will be re-clipped once boat position is known
    const defaultClip = clipMapToCircle(map, Math.floor(map.rows / 2), Math.floor(map.cols / 2), VIEW_RADIUS);
    let currentMapResult = createMap(scene, engine, defaultClip, camera, initialMeta, initialConfirmed);
    let currentMeta: MapMeta | null = initialMeta;

    onBrokerEvent((_data) => {
    });

    let startRow: number | null = null;
    let startCol: number | null = null;
    let startZone = -1;

    if (serverAvailable && currentMeta) {
        // Strategy 1: ship:location (cached position from MongoDB — fast, no external API call)
        try {
            const location = await getShipLocation();
            const pos = serverToGrid(location.position.x, location.position.y, currentMeta);
            startRow = pos.row;
            startCol = pos.col;
            if (location.position.zone != null) startZone = location.position.zone;
        } catch {
            // no cached location
        }

        // Strategy 2: ship:next-level (calls external game API — has currentPosition)
        if (startRow === null) {
            try {
                const ship = await getShipNextLevel();
                const pos = serverToGrid(ship.currentPosition.x, ship.currentPosition.y, currentMeta);
                startRow = pos.row;
                startCol = pos.col;
            } catch {
                // no ship exists yet
            }
        }

        // Strategy 3: build a new ship
        if (startRow === null) {
            try {
                await buildShip();
                const ship = await getShipNextLevel();
                const pos = serverToGrid(ship.currentPosition.x, ship.currentPosition.y, currentMeta);
                startRow = pos.row;
                startCol = pos.col;
            } catch {
                // could not build ship
            }
        }
    }

    // Fallback: first water tile in the map
    if (startRow === null || startCol === null) {
        const firstWater = map.cells.flat().find(c => c.type === TileType.Water);
        if (firstWater) {
            startRow = firstWater.row;
            startCol = firstWater.col;
        }
    }

    if (startRow !== null && startCol !== null) {
        // Clip the map to a circle around the starting position
        let clipCenterRow = startRow;
        let clipCenterCol = startCol;
        const clippedMap = clipMapToCircle(fullMap, clipCenterRow, clipCenterCol, VIEW_RADIUS);
        currentMapResult.dispose();
        currentMapResult = createMap(scene, engine, clippedMap, camera, initialMeta, initialConfirmed, VIEW_RADIUS);

        const boat = await createBoat(scene);
        boat.getChildMeshes().forEach(m => {
            shadowGen.addShadowCaster(m as any);
        });
        createWindEffect(scene, boat);

        const controller = createBoatController(
            boat, currentMapResult.tileMeshes, clippedMap,
            startRow, startCol,
            engine, scene, camera,
            currentMeta,
        );
        if (startZone >= 0) controller.zone = startZone;

        // Re-clip the visible area around a new center
        function reclipAround(row: number, col: number) {
            if (row === clipCenterRow && col === clipCenterCol) return;
            clipCenterRow = row;
            clipCenterCol = col;
            const newClipped = clipMapToCircle(fullMap, row, col, VIEW_RADIUS);
            const newConfirmed = currentMeta
                ? buildConfirmedSet(lastConfirmedRefuel, currentMeta)
                : new Set<string>();
            currentMapResult.applyUpdate(newClipped, newConfirmed, { row, col });
            controller.updateMap(newClipped, currentMapResult.tileMeshes, currentMeta);
        }

        // Incremental map update when server broadcasts map:update
        let lastGridHash = '';
        let lastConfirmedRefuel: { x: number; y: number }[] = gridData.confirmedRefuel ?? [];
        onMapUpdate((gridData) => {
            const gridHash = gridData.grid.join('|');
            if (gridHash === lastGridHash) {
                currentMeta = { minX: gridData.minX, maxX: gridData.maxX, minY: gridData.minY, maxY: gridData.maxY };
                return;
            }
            lastGridHash = gridHash;
            const newFullMap = serverGridToGameMap(gridData);
            fullMap = newFullMap;
            currentMeta = { minX: gridData.minX, maxX: gridData.maxX, minY: gridData.minY, maxY: gridData.maxY };
            lastConfirmedRefuel = gridData.confirmedRefuel ?? [];
            const newConfirmed = buildConfirmedSet(lastConfirmedRefuel, currentMeta);
            const newClipped = clipMapToCircle(fullMap, clipCenterRow, clipCenterCol, VIEW_RADIUS);
            currentMapResult.applyUpdate(newClipped, newConfirmed, { row: clipCenterRow, col: clipCenterCol });
            controller.updateMap(newClipped, currentMapResult.tileMeshes, currentMeta);
        });

        // Move boat when server broadcasts ship:position
        onShipPosition((data) => {
            if (currentMeta) {
                const pos = serverToGrid(data.position.x, data.position.y, currentMeta);
                controller.setPosition(pos.row, pos.col);
                reclipAround(pos.row, pos.col);
            }
            if (data.energy != null) {
                controller.energy = data.energy;
            }
            if (data.position.zone != null) {
                controller.zone = data.position.zone;
            }
        });

        scene.onBeforeRenderObservable.add(() => {
            const pos = controller.boat.position;
            camera.setTarget(new Vector3(pos.x, 0, pos.z));
            // Re-clip when boat moves via keyboard
            reclipAround(controller.gridRow, controller.gridCol);
        });
    }

    return scene;
}
