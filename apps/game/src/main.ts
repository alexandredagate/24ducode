import { Engine } from 'babylonjs';
import './style.css';
import { createScene } from './scenes/game.scene';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);

createScene(engine, canvas).then((scene) => {
  engine.runRenderLoop(() => scene.render());
});

window.addEventListener('resize', () => engine.resize());
