import { Engine } from 'babylonjs';
import './style.css';
import { createScene } from './scenes/game-legacy.scene';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const loadingScreen = document.getElementById('loadingScreen') as HTMLElement;
const loginScreen = document.getElementById('loginScreen') as HTMLElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const loginError = document.getElementById('loginError') as HTMLElement;
const pinInputs = document.querySelectorAll<HTMLInputElement>('.login-pin-input');

const PIN = '1234';

// Auto-focus next input on each digit entry
pinInputs.forEach((input, i) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
    if (input.value && i < pinInputs.length - 1) {
      pinInputs[i + 1].focus();
    }
    // Auto-submit when all 4 digits filled
    if (Array.from(pinInputs).every(inp => inp.value.length === 1)) {
      attemptLogin();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && i > 0) {
      pinInputs[i - 1].focus();
    }
    if (e.key === 'Enter') {
      attemptLogin();
    }
  });
});

loginBtn.addEventListener('click', attemptLogin);

function attemptLogin() {
  const entered = Array.from(pinInputs).map(inp => inp.value).join('');
  if (entered.length < 4) {
    loginError.textContent = 'Entrez les 4 chiffres';
    return;
  }
  if (entered !== PIN) {
    loginError.textContent = 'Code PIN incorrect';
    pinInputs.forEach(inp => {
      inp.classList.add('shake');
      setTimeout(() => inp.classList.remove('shake'), 400);
    });
    setTimeout(() => {
      pinInputs.forEach(inp => (inp.value = ''));
      pinInputs[0].focus();
    }, 400);
    return;
  }

  // PIN correct — transition to loading screen
  loginScreen.classList.add('hidden');
  setTimeout(() => loginScreen.remove(), 800);
  loadingScreen.style.display = '';
  startGame();
}

function startGame() {
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
}
