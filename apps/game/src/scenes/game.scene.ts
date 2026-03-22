import { ArcRotateCamera, Color3, CubeTexture, DirectionalLight, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Texture, Vector3, type Engine } from "babylonjs";
import { TileType, clipMapToCircle } from "../utils/parse-map";
import { createMap } from "../utils/create-map";
import { createBoat } from "../utils/boat";
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
    scene.ambientColor = new Color3(0.05, 0.08, 0.15);

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

    // Soleil directionnel — éclairage principal chaud
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
    sun.intensity = 1.2;
    sun.diffuse = new Color3(1.0, 0.95, 0.85);
    sun.specular = new Color3(1.0, 0.97, 0.9);

    // Ambiante douce bleu ciel
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.35;
    ambient.diffuse = new Color3(0.6, 0.7, 0.9);
    ambient.groundColor = new Color3(0.2, 0.25, 0.3);

    // Fill light remontante — éclaire les côtés des îles
    const fill = new HemisphericLight('fill', new Vector3(0, -1, 0), scene);
    fill.intensity = 0.25;
    fill.diffuse = new Color3(0.8, 0.65, 0.40);
    fill.groundColor = new Color3(0.5, 0.40, 0.25);

    // ─── Skybox ─────────────────────────────────────
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

    // ─── Connect & authenticate ──────────────────────
    let serverAvailable = false;
    let map;

    let gridData;
    try {
        connect();
        const authenticated = await authenticatePlayer();
        if (!authenticated) {
            console.warn('[game] not authenticated, using static map');
        } else {
            serverAvailable = true;
        }

        gridData = await requestMapGrid();
        map = serverGridToGameMap(gridData);
        console.log('[game] server map loaded:', map.cols, 'x', map.rows);
    } catch (err) {
        console.warn('[game] server unavailable, using static fallback', err);
        throw err;
    }

    const initialMeta: MapMeta = { minX: gridData.minX, maxX: gridData.maxX, minY: gridData.minY, maxY: gridData.maxY };
    const initialConfirmed = buildConfirmedSet(gridData.confirmedRefuel, initialMeta);
    const VIEW_RADIUS = 8; // 16x16 circular viewport
    let fullMap = map; // keep the full unclipped map for re-clipping
    // Initial map with center clip — will be re-clipped once boat position is known
    const defaultClip = clipMapToCircle(map, Math.floor(map.rows / 2), Math.floor(map.cols / 2), VIEW_RADIUS);
    let currentMapResult = createMap(scene, engine, defaultClip, camera, initialMeta, initialConfirmed);
    let currentMeta: MapMeta | null = initialMeta;

    // ─── Listen for server broadcasts ────────────────
    onBrokerEvent((data) => {
        console.log('[game] broker:event', data);
    });

    // ─── Resolve boat start position ─────────────────
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
        // Clip the map to a circle around the starting position
        let clipCenterRow = startRow;
        let clipCenterCol = startCol;
        const clippedMap = clipMapToCircle(fullMap, clipCenterRow, clipCenterCol, VIEW_RADIUS);
        currentMapResult.dispose();
        currentMapResult = createMap(scene, engine, clippedMap, camera, initialMeta, initialConfirmed, VIEW_RADIUS);

        const boat = await createBoat(scene);
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

            console.log('[game] map:update — incremental');
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
