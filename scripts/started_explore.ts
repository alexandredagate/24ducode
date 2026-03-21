/**
 * 3026 - Explorateur autonome (v5 - WebSocket Socket.IO)
 *
 * Stratégie : utilise toutes les îles connues comme points de ravitaillement.
 * Ne prend JAMAIS de risque : vérifie toujours qu'on peut rentrer
 * AVANT de bouger. Gère les pannes et les taxes automatiquement.
 *
 * Variables d'environnement :
 *   API_TOKEN  - ton codingGameId
 *   WS_URL     - ex: http://ec2-15-237-116-133.eu-west-3.compute.amazonaws.com:3001
 *
 * Usage : npx tsx scripts/started_explore.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { io, Socket } from "socket.io-client";

// ─── Config ────────────────────────────────────────────────────────────────────

const API_TOKEN = process.env.API_TOKEN!;
const WS_URL = process.env.WS_URL!;
const DATA_FILE = "./explored-cells.json";

if (!API_TOKEN || !WS_URL) {
  console.error("❌ Définir API_TOKEN et WS_URL en variables d'env");
  process.exit(1);
}

const SAFETY_MARGIN = 3;
const MOVE_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_ERRORS = 5;
const DISTRESS_WAIT_MS = 60_000;
// Renouvellement du token 1 min avant expiry (accessToken = 15 min par défaut)
const TOKEN_REFRESH_INTERVAL_MS = 14 * 60 * 1_000;

// ─── Types ─────────────────────────────────────────────────────────────────────

type Direction = "N" | "S" | "E" | "W";
type CellType = "SEA" | "SAND" | "ROCKS";

interface Cell {
  id: string;
  x: number;
  y: number;
  type: CellType;
  zone: number;
  ships?: any[];
}

interface MoveResponse {
  discoveredCells: Cell[];
  position: Cell & { ships: any[] };
  energy: number;
}

interface PlayerDetails {
  id: string;
  name: string;
  money: number;
  resources: { quantity: number; type: string }[];
  home: { name: string; bonusQuotient: number };
  discoveredIslands: { island: { name: string }; islandState: string }[];
  marketPlaceDiscovered: boolean;
}

interface Taxe {
  id: string;
  type: string;
  state: string;
  amount: number;
  remainingTime: number;
}

interface SavedData {
  visitedCells: Record<string, { x: number; y: number; type: CellType; zone: number }>;
  knownIslandCells: string[];
  currentPos: { x: number; y: number } | null;
  homePos: { x: number; y: number } | null;
  energy: number;
  totalMoves: number;
  spottedShips: { x: number; y: number; playerName: string; timestamp: string }[];
  dangerousZones: number[];
  forbiddenZones: number[];
}

// ─── État global ───────────────────────────────────────────────────────────────

let visitedCells = new Map<string, Cell>();
let knownIslandCells = new Set<string>();
let seenSandCells = new Set<string>();
let currentPos: { x: number; y: number } = { x: 0, y: 0 };
let homePos: { x: number; y: number } | null = null;
let energy = 0;
let isReturning = false;
let consecutiveErrors = 0;
let totalMoves = 0;
let spottedShips: { x: number; y: number; playerName: string; timestamp: string }[] = [];
let dangerousZones = new Set<number>();
let forbiddenZones = new Set<number>();
let lastDir: Direction | null = null;

// ─── WebSocket ─────────────────────────────────────────────────────────────────

let socket: Socket;
let refreshToken: string | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function createSocket(): Socket {
  return io(WS_URL, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
  });
}

/**
 * Envoie une commande via Socket.IO et attend la réponse correspondante.
 * Lève une erreur si le serveur répond avec status "error".
 */
async function wsEmit<T>(command: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (res: any) => {
      if (res.command !== command) return;
      socket.off("response", handler);
      if (res.status === "ok") {
        resolve(res.data as T);
      } else {
        reject(new Error(res.error ?? `Erreur WS: ${command}`));
      }
    };
    socket.on("response", handler);
    const msg = payload !== undefined ? { command, payload } : { command };
    socket.emit("message", msg);
  });
}

async function wsLogin(): Promise<void> {
  console.log("🔑 Connexion WebSocket...");
  const data = await wsEmit<{ accessToken: string; refreshToken: string }>("auth:login", {
    codingGameId: API_TOKEN,
  });
  refreshToken = data.refreshToken;
  console.log("✅ Authentifié via WebSocket");
}

async function wsRefreshToken(): Promise<void> {
  if (!refreshToken) return;
  try {
    const data = await wsEmit<{ accessToken: string; refreshToken: string }>("auth:refresh", {
      refreshToken,
    });
    refreshToken = data.refreshToken;
  } catch (e: any) {
    console.warn("⚠️ Échec refresh token, re-login...");
    await wsLogin();
  }
}

function startTokenRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    await wsRefreshToken();
  }, TOKEN_REFRESH_INTERVAL_MS);
}

async function connectWs(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket = createSocket();

    socket.on("connect", async () => {
      try {
        await wsLogin();
        startTokenRefresh();
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Erreur de connexion WebSocket:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.warn(`⚠️ WebSocket déconnecté: ${reason}`);
    });

    socket.on("reconnect", async () => {
      console.log("🔄 Reconnexion WebSocket, re-login...");
      try {
        await wsLogin();
      } catch (e: any) {
        console.error("❌ Re-login échoué:", e.message);
      }
    });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Persistance ──────────────────────────────────────────────────────────────

function loadData() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw: SavedData = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
    for (const [key, cell] of Object.entries(raw.visitedCells)) {
      visitedCells.set(key, { ...cell, id: key } as Cell);
    }
    for (const key of raw.knownIslandCells) knownIslandCells.add(key);
    if (raw.currentPos) currentPos = raw.currentPos;
    if (raw.homePos) homePos = raw.homePos;
    if (raw.energy) energy = raw.energy;
    if (raw.totalMoves) totalMoves = raw.totalMoves;
    if (raw.spottedShips) spottedShips = raw.spottedShips;
    if (raw.dangerousZones) for (const z of raw.dangerousZones) dangerousZones.add(z);
    if ((raw as any).forbiddenZones) for (const z of (raw as any).forbiddenZones) forbiddenZones.add(z);
    console.log(
      `💾 Chargé: ${visitedCells.size} cellules, ${knownIslandCells.size} relais, ${dangerousZones.size} zones dangereuses, ${forbiddenZones.size} zones interdites`
    );
  } catch {
    console.warn("⚠️ Données corrompues, on repart à zéro.");
  }
}

function saveData() {
  const data: SavedData = {
    visitedCells: {},
    knownIslandCells: [...knownIslandCells],
    currentPos,
    homePos,
    energy,
    totalMoves,
    spottedShips,
    dangerousZones: [...dangerousZones],
    forbiddenZones: [...forbiddenZones],
  };
  for (const [key, cell] of visitedCells) {
    data.visitedCells[key] = { x: cell.x, y: cell.y, type: cell.type, zone: cell.zone };
  }
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Taxes : détection et paiement automatique ────────────────────────────────

async function checkAndPayTaxes(): Promise<boolean> {
  try {
    const taxes = await wsEmit<Taxe[]>("tax:list", { status: "DUE" });
    if (taxes.length === 0) return false;

    for (const tax of taxes) {
      console.log(
        `  💸 Taxe ${tax.type} : ${tax.amount} OR | temps restant: ${tax.remainingTime}s`
      );

      if (tax.remainingTime > 0) {
        const details = await wsEmit<PlayerDetails>("player:details");
        if (details.money >= tax.amount) {
          console.log(`  💳 Paiement de la taxe ${tax.id}...`);
          try {
            await wsEmit("tax:pay", { taxId: tax.id });
            console.log(`  ✅ Taxe payée !`);
          } catch (e: any) {
            console.log(`  ❌ Échec paiement: ${e.message}`);
          }
        } else {
          console.log(
            `  ⏳ Pas assez d'or (${details.money}/${tax.amount}), attente du remorquage gratuit (${tax.remainingTime}s)...`
          );
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Géométrie (niveau 1 : N/S/E/W) ───────────────────────────────────────────

const DIR_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};
const ALL_DIRS: Direction[] = ["N", "S", "E", "W"];
const OPPOSITE: Record<Direction, Direction> = { N: "S", S: "N", E: "W", W: "E" };

function manhattanDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// ─── Gestion des relais ───────────────────────────────────────────────────────

function findNearestKnownIsland(from: { x: number; y: number }): {
  pos: { x: number; y: number };
  dist: number;
} | null {
  let best: { pos: { x: number; y: number }; dist: number } | null = null;
  for (const key of knownIslandCells) {
    const [x, y] = key.split(",").map(Number);
    const d = manhattanDist(from, { x, y });
    if (!best || d < best.dist) best = { pos: { x, y }, dist: d };
  }
  return best;
}

function directionFromTo(
  from: { x: number; y: number },
  to: { x: number; y: number }
): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "N";
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

function wouldHitRocks(dir: Direction): boolean {
  const v = DIR_VECTORS[dir];
  const key = `${currentPos.x + v.dx},${currentPos.y + v.dy}`;
  const cell = visitedCells.get(key);
  if (!cell) return false;
  if (cell.type === "ROCKS") return true;
  if (forbiddenZones.has(cell.zone)) return true;
  return false;
}

/**
 * VÉRIFICATION CRITIQUE avant chaque mouvement :
 * Depuis la position APRÈS le mouvement, est-ce que l'énergie restante
 * permet de rejoindre un relais connu avec la marge de sécurité ?
 *
 * ⚠️ On utilise energy - 1 car le mouvement coûte 1 point.
 */
function canSafelyMove(dir: Direction): boolean {
  if (wouldHitRocks(dir)) return false;

  const v = DIR_VECTORS[dir];
  const nextPos = { x: currentPos.x + v.dx, y: currentPos.y + v.dy };
  const energyAfterMove = energy - 1;

  if (knownIslandCells.has(`${nextPos.x},${nextPos.y}`)) return true;

  const nearest = findNearestKnownIsland(nextPos);
  if (!nearest) return false;

  return energyAfterMove >= nearest.dist + SAFETY_MARGIN;
}

/**
 * Est-ce qu'on DOIT rentrer maintenant ?
 * On rentre si explorer dans n'importe quelle direction ne serait pas safe.
 */
function mustReturn(): boolean {
  if (isOnKnownIsland()) return false;

  const nearest = findNearestKnownIsland(currentPos);
  if (!nearest) return true;

  return energy <= nearest.dist + SAFETY_MARGIN;
}

function isOnKnownIsland(): boolean {
  return knownIslandCells.has(`${currentPos.x},${currentPos.y}`);
}

// ─── Stratégie d'exploration ──────────────────────────────────────────────────

function pickExplorationDirection(): Direction | null {
  const scored: { dir: Direction; score: number }[] = [];

  for (const dir of ALL_DIRS) {
    if (!canSafelyMove(dir)) continue;

    const v = DIR_VECTORS[dir];
    const nx = currentPos.x + v.dx;
    const ny = currentPos.y + v.dy;
    const key = `${nx},${ny}`;
    const cell = visitedCells.get(key);

    let score = 0;

    if (!cell) {
      score += 15;
    } else {
      score += 1;
    }

    let unknownNeighbors = 0;
    for (const d2 of ALL_DIRS) {
      const v2 = DIR_VECTORS[d2];
      if (!visitedCells.has(`${nx + v2.dx},${ny + v2.dy}`)) unknownNeighbors++;
    }
    score += unknownNeighbors * 3;

    if (lastDir === dir) score += 4;
    if (lastDir && dir === OPPOSITE[lastDir]) score -= 5;

    if (cell && dangerousZones.has(cell.zone)) score -= 15;

    score += Math.random() * 2;

    scored.push({ dir, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].dir;
}

function pickReturnDirection(): Direction | null {
  const nearest = findNearestKnownIsland(currentPos);
  const target = nearest?.pos ?? homePos ?? { x: 0, y: 0 };

  const options: { dir: Direction; dist: number }[] = [];

  for (const dir of ALL_DIRS) {
    if (wouldHitRocks(dir)) continue;

    const v = DIR_VECTORS[dir];
    const np = { x: currentPos.x + v.dx, y: currentPos.y + v.dy };
    const distAfter = manhattanDist(np, target);
    options.push({ dir, dist: distAfter });
  }

  if (options.length === 0) return null;
  options.sort((a, b) => a.dist - b.dist);
  return options[0].dir;
}

// ─── Enregistrement des cellules ───────────────────────────────────────────────

function recordCells(cells: Cell[]) {
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    visitedCells.set(key, cell);
    if (cell.type === "SAND") seenSandCells.add(key);
  }
}

// ─── Gestion des erreurs spécifiques du jeu ───────────────────────────────────

async function handleGameError(errorMsg: string): Promise<void> {
  if (errorMsg.includes("GAME_OVER_INSERT_COINS") || errorMsg.includes("amende")) {
    console.log("\n💀 Bateau en panne ! Vérification des taxes...");
    await sleep(MOVE_DELAY_MS);
    const hasTaxes = await checkAndPayTaxes();

    if (hasTaxes) {
      console.log("⏳ Attente de la fin de l'immobilisation...");
      let still_stuck = true;
      while (still_stuck) {
        await sleep(DISTRESS_WAIT_MS);
        try {
          await checkAndPayTaxes();
          const test = await wsEmit<MoveResponse>("ship:move", { direction: "N" });
          currentPos = { x: test.position.x, y: test.position.y };
          energy = test.energy;
          recordCells(test.discoveredCells);
          still_stuck = false;
          console.log(
            `🔓 Bateau libre ! Pos: (${currentPos.x}, ${currentPos.y}) | ⚡ ${energy}`
          );
        } catch (e: any) {
          if (e.message.includes("SHIP_IN_DISTRESS")) {
            console.log("  ⏳ Toujours immobilisé, nouvelle tentative dans 60s...");
          } else {
            console.log(`  ❌ ${e.message}`);
          }
        }
      }
    }
  } else if (errorMsg.includes("SHIP_IN_DISTRESS")) {
    console.log("⏳ Bateau immobilisé, attente 60s...");
    await sleep(DISTRESS_WAIT_MS);
  }

  const cell = visitedCells.get(`${currentPos.x},${currentPos.y}`);
  if (cell) {
    dangerousZones.add(cell.zone);
    console.log(`  🚨 Zone ${cell.zone} marquée dangereuse`);
  }

  isReturning = false;
  lastDir = null;
  seenSandCells.clear();
  saveData();
}

// ─── Boucle principale ────────────────────────────────────────────────────────

async function init() {
  console.log("🚀 Explorateur 3026 v5 (WebSocket Socket.IO)\n");
  loadData();

  await connectWs();

  const details = await wsEmit<PlayerDetails>("player:details");
  console.log(`👤 ${details.name} | 💰 ${details.money} OR`);
  console.log(`🏝  Home: ${details.home.name}`);
  console.log(`📦 ${details.resources.map((r) => `${r.type}=${r.quantity}`).join(", ")}`);
  console.log(
    `🗺  Îles: ${details.discoveredIslands.map((i) => `${i.island.name}(${i.islandState})`).join(", ") || "aucune"}`
  );

  await checkAndPayTaxes();

  console.log();
  return details;
}

async function explore() {
  await init();

  // Tenter de construire le bateau
  try {
    await wsEmit<{ shipId: string }>("ship:build");
    console.log("⛵ Bateau construit !");
    // Récupérer la position initiale via ship:next-level (contient currentPosition)
    try {
      const info = await wsEmit<any>("ship:next-level");
      if (info.currentPosition) {
        currentPos = { x: info.currentPosition.x, y: info.currentPosition.y };
        homePos = { ...currentPos };
        recordCells([info.currentPosition]);
        knownIslandCells.add(`${currentPos.x},${currentPos.y}`);
        saveData();
      }
    } catch { /* ignore, la position sera récupérée au premier move */ }
  } catch {
    console.log("⛵ Bateau déjà construit.");
  }

  await sleep(MOVE_DELAY_MS);

  // Sonde initiale si besoin
  if (!homePos || knownIslandCells.size === 0) {
    try {
      const probe = await wsEmit<MoveResponse>("ship:move", { direction: "N" });
      currentPos = { x: probe.position.x, y: probe.position.y };
      energy = probe.energy;
      recordCells(probe.discoveredCells);

      for (const cell of probe.discoveredCells) {
        if (cell.type === "SAND") {
          if (!homePos) homePos = { x: cell.x, y: cell.y };
          knownIslandCells.add(`${cell.x},${cell.y}`);
        }
      }
      if (!homePos) {
        homePos = { x: currentPos.x, y: currentPos.y + 1 };
        knownIslandCells.add(`${homePos.x},${homePos.y}`);
      }
      saveData();
      await sleep(MOVE_DELAY_MS);
    } catch (e: any) {
      await handleGameError(e.message);
      return explore();
    }
  }

  if (knownIslandCells.size === 0 && homePos) {
    knownIslandCells.add(`${homePos.x},${homePos.y}`);
  }

  console.log(
    `🧭 Pos: (${currentPos.x}, ${currentPos.y}) | ⚡ ${energy} | 🏝 ${knownIslandCells.size} relais\n`
  );

  // ─── Boucle ────────────────────────────────────────────────────────────────

  let lastAttemptedDir: Direction | null = null;

  while (true) {
    try {
      // ── Si on est sur une île connue, valider et recharger ──
      if (isOnKnownIsland()) {
        if (seenSandCells.size > 0 || isReturning) {
          const newKnown = seenSandCells.size;
          for (const key of seenSandCells) knownIslandCells.add(key);
          seenSandCells.clear();
          isReturning = false;
          lastDir = null;

          console.log(
            `\n✅ Relais (${currentPos.x}, ${currentPos.y}) | +${newKnown} SAND validées | ${knownIslandCells.size} relais total`
          );
          saveData();
        }
      }

      // ── Décider : explorer ou rentrer ──
      if (!isReturning && mustReturn()) {
        const nearest = findNearestKnownIsland(currentPos);
        console.log(
          `\n🔙 Retour ! ⚡ ${energy} | relais à dist ${nearest?.dist ?? "?"}`
        );
        isReturning = true;
      }

      // ── Choisir la direction ──
      let direction: Direction | null;

      if (isReturning) {
        direction = pickReturnDirection();
        if (!direction) {
          console.log("⚠️ Aucune direction de retour possible, attente...");
          await sleep(DISTRESS_WAIT_MS);
          continue;
        }
      } else {
        direction = pickExplorationDirection();
        if (!direction) {
          if (isOnKnownIsland()) {
            const fallback = ALL_DIRS.find((d) => !wouldHitRocks(d));
            if (fallback) {
              console.log(
                `🔄 Coincé sur relais avec ⚡ ${energy} en mémoire → tentative ${fallback} pour actualiser l'énergie...`
              );
              try {
                lastAttemptedDir = fallback;
                const res = await wsEmit<MoveResponse>("ship:move", { direction: fallback });
                currentPos = { x: res.position.x, y: res.position.y };
                energy = res.energy;
                totalMoves++;
                lastDir = fallback;
                recordCells(res.discoveredCells);
                recordCells([res.position as Cell]);
                console.log(
                  `  ✅ Ça passe ! ⚡ réelle: ${energy} | Pos: (${currentPos.x}, ${currentPos.y})`
                );
                await sleep(MOVE_DELAY_MS);
                continue;
              } catch (moveErr: any) {
                if (moveErr.message.includes("FORBIDDEN")) {
                  const v = DIR_VECTORS[fallback];
                  const tc = visitedCells.get(`${currentPos.x + v.dx},${currentPos.y + v.dy}`);
                  if (tc) {
                    forbiddenZones.add(tc.zone);
                    console.log(`  🚫 Zone ${tc.zone} interdite`);
                  }
                  saveData();
                  await sleep(MOVE_DELAY_MS);
                  continue;
                }
                console.log(`  ❌ ${moveErr.message}`);
              }
            }

            console.log("🔒 Toutes les directions bloquées depuis ce relais. Attente 60s...");
            await sleep(60_000);
            continue;
          }

          console.log("⚠️ Aucune direction safe → retour forcé");
          isReturning = true;
          continue;
        }
      }

      // ── Double vérification avant le move (sauf retour) ──
      if (!isReturning && !canSafelyMove(direction)) {
        console.log("⚠️ Dernière vérif échouée → retour");
        isReturning = true;
        continue;
      }

      // ── MOVE ──
      lastAttemptedDir = direction;
      const res = await wsEmit<MoveResponse>("ship:move", { direction });

      currentPos = { x: res.position.x, y: res.position.y };
      energy = res.energy;
      totalMoves++;
      lastDir = direction;
      consecutiveErrors = 0;

      recordCells(res.discoveredCells);
      recordCells([res.position as Cell]);

      // ── Log ──
      const sandFound = res.discoveredCells.filter((c) => c.type === "SAND");
      const nearest = findNearestKnownIsland(currentPos);
      const icon = isReturning ? "🔙" : "🧭";

      console.log(
        `${icon} [${String(totalMoves).padStart(4)}] ${direction} → (${String(currentPos.x).padStart(4)}, ${String(currentPos.y).padStart(4)}) | ⚡ ${String(energy).padStart(3)} | relais: ${nearest?.dist ?? "?"}${sandFound.length > 0 ? ` | 🏖 ${sandFound.length} SAND!` : ""}`
      );

      for (const cell of res.discoveredCells) {
        if (cell.ships && cell.ships.length > 0) {
          for (const s of cell.ships) {
            const name = s.playerName || "?";
            console.log(`  ⚠️  Bateau: ${name} en (${cell.x}, ${cell.y})`);
            spottedShips.push({
              x: cell.x, y: cell.y, playerName: name,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      if (totalMoves % 10 === 0) saveData();
      await sleep(MOVE_DELAY_MS);
    } catch (e: any) {
      consecutiveErrors++;
      console.error(`❌ [${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}]: ${e.message}`);

      if (
        e.message.includes("GAME_OVER_INSERT_COINS") ||
        e.message.includes("SHIP_IN_DISTRESS")
      ) {
        await handleGameError(e.message);
        consecutiveErrors = 0;
        continue;
      }

      // UNAUTHORIZED : tenter un re-login
      if (e.message.includes("UNAUTHORIZED")) {
        console.log("🔑 Token expiré, re-login...");
        try {
          await wsLogin();
          consecutiveErrors = 0;
        } catch (loginErr: any) {
          console.error("❌ Re-login échoué:", loginErr.message);
        }
        continue;
      }

      if (e.message.includes("FORBIDDEN")) {
        if (lastAttemptedDir) {
          const v = DIR_VECTORS[lastAttemptedDir];
          const targetKey = `${currentPos.x + v.dx},${currentPos.y + v.dy}`;
          const targetCell = visitedCells.get(targetKey);
          if (targetCell) {
            forbiddenZones.add(targetCell.zone);
            console.log(`  🚫 Zone ${targetCell.zone} marquée interdite (niveau insuffisant)`);
          } else {
            const match = e.message.match(/zone\s+(\d+)/i);
            if (match) {
              forbiddenZones.add(parseInt(match[1]));
              console.log(`  🚫 Zone ${match[1]} marquée interdite (depuis message d'erreur)`);
            }
          }
        }
        consecutiveErrors = 0;
        saveData();
        await sleep(MOVE_DELAY_MS);
        continue;
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error("💀 Trop d'erreurs. Pause 2 min...");
        saveData();
        await sleep(120_000);
        consecutiveErrors = 0;
      } else {
        await sleep(MOVE_DELAY_MS);
      }
    }
  }
}

// ─── Go ! ──────────────────────────────────────────────────────────────────────

explore().catch((e) => {
  console.error("💀 Erreur fatale:", e);
  process.exit(1);
});
