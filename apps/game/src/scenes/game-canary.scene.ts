import { Engine, Scene } from "babylonjs";

export async function createScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
    const scene = new Scene(engine);
    return scene;
};