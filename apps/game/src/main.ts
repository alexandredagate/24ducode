import { Engine } from 'babylonjs';
import './style.css';
import { createScene } from './scenes/game-legacy.scene';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const loadingScreen = document.getElementById('loadingScreen');

const engine = new Engine(canvas, true, {
  antialias: true,
  stencil: true,
});

function dismissLoading() {
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    setTimeout(() => loadingScreen.remove(), 1000);
  }
}

createScene(engine, canvas).then((scene) => {
  engine.runRenderLoop(() => scene.render());
  dismissLoading();
}).catch((err) => {
  console.error('[game] scene creation failed:', err);
  dismissLoading();
});

window.addEventListener('resize', () => engine.resize());
