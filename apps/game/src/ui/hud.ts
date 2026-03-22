import {
  getPlayerDetails, getTaxes, getThefts, getMarketplaceOffers,
  onBrokerEvent,
  type PlayerDetails,
} from "../services/socket";

const ICONS = {
  coin: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="#ffd866" stroke="#b8962e" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="#8b6914">$</text></svg>`,
  feronium: `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8" fill="#7088aa" stroke="#4a6080" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#a0b8d0" opacity="0.6"/></svg>`,
  boisium: `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8" fill="#6aaa4a" stroke="#4a8030" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#8acc6a" opacity="0.6"/></svg>`,
  charbonium: `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 22,8 22,16 12,22 2,16 2,8" fill="#555555" stroke="#333" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#777" opacity="0.6"/></svg>`,
  energy: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#ffd866" stroke="#b89620" stroke-width="1"/></svg>`,
  ship: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.14.52-.05.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" fill="#c8ddf0"/></svg>`,
  compass: `<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10" fill="none" stroke="#7eb8ff" stroke-width="1.5"/><polygon points="12,4 14,12 12,14 10,12" fill="#ff6666"/><polygon points="12,20 10,12 12,10 14,12" fill="#e0e8f0"/></svg>`,
  island: `<svg viewBox="0 0 24 24" width="14" height="14"><ellipse cx="12" cy="18" rx="10" ry="3" fill="#4a90d9" opacity="0.4"/><path d="M6 18c0-3 2-6 4-8s4-5 4-5 2 3 4 5 4 5 4 8" fill="#3daa55" stroke="#2a8040" stroke-width="1"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="#ff6644"/></svg>`,
  speed: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44z" fill="#7eb8ff"/><path d="M10.59 15.41a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z" fill="#ffd866"/></svg>`,
  move: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2l-5 5h3v4H6V8l-5 5 5 5v-3h4v4H7l5 5 5-5h-3v-4h4v3l5-5-5-5v3h-4V7h3l-5-5z" fill="#7eb8ff"/></svg>`,
  market: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 14.8V15h9.6l2.4-7H6.2l1 4.8z" fill="#7eb8ff"/><path d="M1 2v2h2l3.6 7.6L5.2 14c-.1.3-.2.6-.2 1 0 1.1.9 2 2 2h12v-2H7.4l.6-1.2L20 6H5.2L4.3 4 3 2H1z" fill="#7eb8ff"/></svg>`,
  theft: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="none" stroke="#ff6666" stroke-width="2"/><path d="M10 12l-2-2-1.41 1.41L10 14.83l7-7-1.41-1.42L10 12z" fill="#ff6666"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="#7eb8ff" opacity="0.8"/></svg>`,
  storage: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z" fill="#9088cc"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="#4dff91"/></svg>`,
  question: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" fill="#d4952a"/></svg>`,
};

export interface HudElements {
  root: HTMLDivElement;

  // Top-left
  energyGaugeFill: HTMLDivElement;
  energyGaugeText: HTMLDivElement;
  zoneLabel: HTMLSpanElement;
  posLabel: HTMLSpanElement;
  playerNameLabel: HTMLSpanElement;
  quotientLabel: HTMLSpanElement;
  islandsLabel: HTMLSpanElement;

  // Top-right
  moneyPanel: { el: HTMLDivElement; label: HTMLSpanElement };
  ferPanel: { el: HTMLDivElement; label: HTMLSpanElement };
  boiPanel: { el: HTMLDivElement; label: HTMLSpanElement };
  chaPanel: { el: HTMLDivElement; label: HTMLSpanElement };

  // Bottom-right: ship + taxes + thefts
  shipNameLabel: HTMLSpanElement;
  shipMovesLabel: HTMLSpanElement;
  shipSpeedLabel: HTMLSpanElement;
  shipVisLabel: HTMLSpanElement;
  taxContainer: HTMLDivElement;
  theftContainer: HTMLDivElement;
  storageNameLabel: HTMLSpanElement;
  storageFerBar: HTMLDivElement;
  storageFerText: HTMLSpanElement;
  storageBoiBar: HTMLDivElement;
  storageBoiText: HTMLSpanElement;
  storageChaBar: HTMLDivElement;
  storageChaText: HTMLSpanElement;

  // Right-middle: islands list + marketplace
  islandsList: HTMLDivElement;
  marketList: HTMLDivElement;

  // Bottom-center: activity log
  activityLog: HTMLDivElement;

  showDelta: (panelEl: HTMLDivElement, delta: number, gainClass?: string) => void;
  pushActivity: (text: string, type?: 'info' | 'warn' | 'success') => void;
  dispose: () => void;
}

function createResourcePanel(icon: string, title: string): { el: HTMLDivElement; label: HTMLSpanElement } {
  const panel = document.createElement('div');
  panel.className = 'hud-res-panel';

  const header = document.createElement('div');
  header.className = 'hud-res-header';
  header.innerHTML = `${icon}<span class="hud-res-title">${title}</span>`;

  const label = document.createElement('span');
  label.className = 'hud-res-value';
  label.textContent = '--';

  panel.append(header, label);
  return { el: panel, label };
}

function createStatRow(icon: string, labelText: string): { row: HTMLDivElement; value: HTMLSpanElement } {
  const row = document.createElement('div');
  row.className = 'hud-stat-row';
  row.innerHTML = `${icon}<span class="hud-stat-label">${labelText}</span>`;
  const value = document.createElement('span');
  value.className = 'hud-stat-value';
  value.textContent = '--';
  row.appendChild(value);
  return { row, value };
}

export function buildHud(): HudElements {
  const root = document.createElement('div');
  root.id = 'game-hud';

  // TOP-LEFT: player + energy + zone + pos
  const topLeft = document.createElement('div');
  topLeft.className = 'hud-top-left';

  // Player info card
  const playerCard = document.createElement('div');
  playerCard.className = 'hud-card hud-player-card';

  const playerNameLabel = document.createElement('span');
  playerNameLabel.className = 'hud-player-name';
  playerNameLabel.textContent = 'Chargement...';

  const playerMeta = document.createElement('div');
  playerMeta.className = 'hud-player-meta';

  const quotientLabel = document.createElement('span');
  quotientLabel.className = 'hud-player-quotient';
  quotientLabel.innerHTML = `${ICONS.speed} QI: --`;

  const islandsLabel = document.createElement('span');
  islandsLabel.className = 'hud-player-islands';
  islandsLabel.innerHTML = `${ICONS.island} Iles: --`;

  playerMeta.append(quotientLabel, islandsLabel);
  playerCard.append(playerNameLabel, playerMeta);

  // Energy gauge
  const energyCard = document.createElement('div');
  energyCard.className = 'hud-card';

  const energyLabel = document.createElement('div');
  energyLabel.className = 'hud-gauge-label';
  energyLabel.innerHTML = `${ICONS.energy} ENERGIE`;

  const energyGaugeWrap = document.createElement('div');
  energyGaugeWrap.className = 'hud-gauge-track';

  const energyGaugeFill = document.createElement('div');
  energyGaugeFill.className = 'hud-gauge-fill';

  const energyGaugeText = document.createElement('div');
  energyGaugeText.className = 'hud-gauge-text';

  energyGaugeWrap.append(energyGaugeFill, energyGaugeText);
  energyCard.append(energyLabel, energyGaugeWrap);

  // Zone + Position
  const navCard = document.createElement('div');
  navCard.className = 'hud-card hud-nav-card';

  const zoneRow = createStatRow(ICONS.compass, 'Zone');
  const posRow = createStatRow(ICONS.move, 'Pos');

  navCard.append(zoneRow.row, posRow.row);

  topLeft.append(playerCard, energyCard, navCard);

  // TOP-RIGHT: resources
  const topRight = document.createElement('div');
  topRight.className = 'hud-top-right';

  const moneyPanel = createResourcePanel(ICONS.coin, 'Or');
  const ferPanel = createResourcePanel(ICONS.feronium, 'Feronium');
  const boiPanel = createResourcePanel(ICONS.boisium, 'Boisium');
  const chaPanel = createResourcePanel(ICONS.charbonium, 'Charbonium');

  topRight.append(moneyPanel.el, ferPanel.el, boiPanel.el, chaPanel.el);

  // RIGHT-SIDE: islands + marketplace (scrollable panels)
  const rightMiddle = document.createElement('div');
  rightMiddle.className = 'hud-right-middle';

  // Islands list
  const islandsCard = document.createElement('div');
  islandsCard.className = 'hud-card hud-scroll-card';
  const islandsTitle = document.createElement('div');
  islandsTitle.className = 'hud-card-title';
  islandsTitle.innerHTML = `${ICONS.island} ILES DECOUVERTES`;
  const islandsList = document.createElement('div');
  islandsList.className = 'hud-scroll-list';
  islandsList.innerHTML = '<div class="hud-scroll-empty">Aucune ile</div>';
  islandsCard.append(islandsTitle, islandsList);

  // Marketplace
  const marketCard = document.createElement('div');
  marketCard.className = 'hud-card hud-scroll-card';
  const marketTitle = document.createElement('div');
  marketTitle.className = 'hud-card-title';
  marketTitle.innerHTML = `${ICONS.market} MARKETPLACE`;
  const marketList = document.createElement('div');
  marketList.className = 'hud-scroll-list';
  marketList.innerHTML = '<div class="hud-scroll-empty">Aucune offre</div>';
  marketCard.append(marketTitle, marketList);

  rightMiddle.append(islandsCard, marketCard);

  // BOTTOM-RIGHT: ship info + taxes + thefts
  const bottomRight = document.createElement('div');
  bottomRight.className = 'hud-bottom-right';

  const shipCard = document.createElement('div');
  shipCard.className = 'hud-card hud-ship-card';

  const shipTitle = document.createElement('div');
  shipTitle.className = 'hud-card-title';
  shipTitle.innerHTML = `${ICONS.ship} NAVIRE`;

  const shipNameLabel = document.createElement('span');
  shipNameLabel.className = 'hud-ship-name';
  shipNameLabel.textContent = '--';

  const shipMovesRow = createStatRow(ICONS.move, 'Moves');
  const shipSpeedRow = createStatRow(ICONS.speed, 'Vitesse');
  const shipVisRow = createStatRow(ICONS.compass, 'Vision');

  shipCard.append(shipTitle, shipNameLabel, shipMovesRow.row, shipSpeedRow.row, shipVisRow.row);

  const storageCard = document.createElement('div');
  storageCard.className = 'hud-card hud-storage-card';

  const storageTitle = document.createElement('div');
  storageTitle.className = 'hud-card-title';
  storageTitle.innerHTML = `${ICONS.storage} ENTREPOT`;

  const storageNameLabel = document.createElement('span');
  storageNameLabel.className = 'hud-storage-name';
  storageNameLabel.textContent = '--';

  function createStorageBar(icon: string) {
    const row = document.createElement('div');
    row.className = 'hud-storage-row';
    row.innerHTML = `${icon}`;
    const track = document.createElement('div');
    track.className = 'hud-storage-track';
    const bar = document.createElement('div');
    bar.className = 'hud-storage-bar';
    const text = document.createElement('span');
    text.className = 'hud-storage-text';
    text.textContent = '-- / --';
    track.append(bar, text);
    row.append(track);
    return { row, bar, text };
  }

  const storageFer = createStorageBar(ICONS.feronium);
  const storageBoi = createStorageBar(ICONS.boisium);
  const storageCha = createStorageBar(ICONS.charbonium);

  storageCard.append(storageTitle, storageNameLabel, storageFer.row, storageBoi.row, storageCha.row);

  // Tax warnings
  const taxContainer = document.createElement('div');
  taxContainer.className = 'hud-tax-container';

  // Theft panel
  const theftContainer = document.createElement('div');
  theftContainer.className = 'hud-theft-container';

  bottomRight.append(shipCard, storageCard, taxContainer, theftContainer);

  // BOTTOM-CENTER: activity log (chat-like)
  const activityWrap = document.createElement('div');
  activityWrap.className = 'hud-activity-wrap';

  const activityTitle = document.createElement('div');
  activityTitle.className = 'hud-activity-title';
  activityTitle.innerHTML = `${ICONS.chat} ACTIVITE`;

  const activityLog = document.createElement('div');
  activityLog.className = 'hud-activity-log';

  activityWrap.append(activityTitle, activityLog);

  // Assemble
  root.append(topLeft, topRight, rightMiddle, bottomRight, activityWrap);
  document.body.appendChild(root);

  function showDelta(panelEl: HTMLDivElement, delta: number, gainClass = 'hud-delta--gain') {
    if (delta === 0) return;
    const d = document.createElement('div');
    d.className = delta > 0 ? `hud-delta ${gainClass}` : 'hud-delta hud-delta--loss';
    d.textContent = delta > 0 ? `+${delta}` : `${delta}`;
    panelEl.appendChild(d);
    d.addEventListener('animationend', () => d.remove(), { once: true });
  }

  function pushActivity(text: string, type: 'info' | 'warn' | 'success' = 'info') {
    const line = document.createElement('div');
    line.className = `hud-activity-line hud-activity-line--${type}`;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    line.innerHTML = `<span class="hud-activity-ts">${ts}</span> ${text}`;
    activityLog.appendChild(line);
    activityLog.scrollTop = activityLog.scrollHeight;

    // Cap at 50 entries
    while (activityLog.children.length > 50) {
      activityLog.firstChild?.remove();
    }
  }

  // Push a welcome message
  pushActivity('Connexion au serveur...', 'info');

  return {
    root,
    energyGaugeFill: energyGaugeFill as HTMLDivElement,
    energyGaugeText: energyGaugeText as HTMLDivElement,
    zoneLabel: zoneRow.value,
    posLabel: posRow.value,
    playerNameLabel,
    quotientLabel,
    islandsLabel,
    moneyPanel,
    ferPanel,
    boiPanel,
    chaPanel,
    shipNameLabel,
    shipMovesLabel: shipMovesRow.value,
    shipSpeedLabel: shipSpeedRow.value,
    shipVisLabel: shipVisRow.value,
    taxContainer: taxContainer as HTMLDivElement,
    theftContainer: theftContainer as HTMLDivElement,
    storageNameLabel,
    storageFerBar: storageFer.bar as HTMLDivElement,
    storageFerText: storageFer.text,
    storageBoiBar: storageBoi.bar as HTMLDivElement,
    storageBoiText: storageBoi.text,
    storageChaBar: storageCha.bar as HTMLDivElement,
    storageChaText: storageCha.text,
    islandsList: islandsList as HTMLDivElement,
    marketList: marketList as HTMLDivElement,
    activityLog: activityLog as HTMLDivElement,
    showDelta,
    pushActivity,
    dispose() {
      root.remove();
    },
  };
}

export async function fetchAndUpdatePlayerInfo(hud: HudElements): Promise<PlayerDetails | null> {
  try {
    const details = await getPlayerDetails();
    hud.playerNameLabel.textContent = details.name ?? 'Joueur';
    hud.quotientLabel.innerHTML = `${ICONS.speed} QI: ${details.quotient ?? 0}`;
    const discovered = details.discoveredIslands?.length ?? 0;
    hud.islandsLabel.innerHTML = `${ICONS.island} Iles: ${discovered}`;

    // Update islands list
    updateIslandsList(hud, details);

    // Update ship info from player:details (more reliable than ship:next-level)
    const ship = (details as Record<string, any>).ship;
    if (ship) {
      const levelName = ship.level?.name ?? 'Navire';
      hud.shipNameLabel.textContent = levelName.charAt(0).toUpperCase() + levelName.slice(1);
      hud.shipMovesLabel.textContent = `${ship.availableMove ?? '--'} / ${ship.level?.maxMovement ?? '--'}`;
      hud.shipSpeedLabel.textContent = `${ship.level?.speed ?? '--'}`;
      hud.shipVisLabel.textContent = `${ship.level?.visibilityRange ?? '--'}`;
    }

    const storage = (details as Record<string, any>).storage;
    if (storage) {
      hud.storageNameLabel.textContent = storage.name ?? 'Entrepot';
      const maxRes = storage.maxResources ?? {};
      const resources = details.resources ?? [];
      const fer = resources.find((r: any) => r.type === 'FERONIUM')?.quantity ?? 0;
      const boi = resources.find((r: any) => r.type === 'BOISIUM')?.quantity ?? 0;
      const cha = resources.find((r: any) => r.type === 'CHARBONIUM')?.quantity ?? 0;
      const maxFer = maxRes.FERONIUM ?? 1;
      const maxBoi = maxRes.BOISIUM ?? 1;
      const maxCha = maxRes.CHARBONIUM ?? 1;

      function updateBar(bar: HTMLDivElement, text: HTMLSpanElement, qty: number, max: number) {
        const pct = Math.min(100, (qty / max) * 100);
        bar.style.width = `${pct}%`;
        bar.style.background = pct > 90 ? '#e04040' : pct > 70 ? '#d0a020' : 'rgba(126, 184, 255, 0.4)';
        text.textContent = `${qty.toLocaleString()} / ${max.toLocaleString()}`;
      }

      updateBar(hud.storageFerBar, hud.storageFerText, fer, maxFer);
      updateBar(hud.storageBoiBar, hud.storageBoiText, boi, maxBoi);
      updateBar(hud.storageChaBar, hud.storageChaText, cha, maxCha);
    }

    return details;
  } catch (err) {
    console.warn('[hud] player:details failed:', err);
    return null;
  }
}

function updateIslandsList(hud: HudElements, details: PlayerDetails) {
  const islands = details.discoveredIslands ?? [];
  if (islands.length === 0) {
    hud.islandsList.innerHTML = '<div class="hud-scroll-empty">Aucune ile decouverte</div>';
    return;
  }

  hud.islandsList.innerHTML = '';
  for (const di of islands) {
    const item = document.createElement('div');
    item.className = 'hud-island-item';
    const isKnown = di.islandState === 'KNOWN';
    const statusIcon = isKnown ? ICONS.check : ICONS.question;
    const statusClass = isKnown ? 'hud-island-known' : 'hud-island-discovered';
    const bonus = di.island.bonusQuotient > 0 ? ` <span class="hud-island-bonus">+${di.island.bonusQuotient} QI</span>` : '';
    item.innerHTML = `
      <span class="hud-island-status ${statusClass}">${statusIcon}</span>
      <span class="hud-island-name">${di.island.name}</span>${bonus}
    `;
    hud.islandsList.appendChild(item);
  }
}

export async function fetchAndUpdateTaxes(hud: HudElements): Promise<void> {
  try {
    const taxes = await getTaxes('DUE');
    hud.taxContainer.innerHTML = '';
    if (!taxes || taxes.length === 0) return;

    for (const tax of taxes) {
      const card = document.createElement('div');
      card.className = 'hud-card hud-tax-card';
      const mins = Math.floor((tax.remainingTime ?? 0) / 60);
      const secs = (tax.remainingTime ?? 0) % 60;
      card.innerHTML = `
        <div class="hud-tax-header">${ICONS.warning} TAXE ${tax.type}</div>
        <div class="hud-tax-amount">${tax.amount} $</div>
        <div class="hud-tax-time">${mins}m ${secs}s restantes</div>
      `;
      hud.taxContainer.appendChild(card);
    }
  } catch (err) {
    console.warn('[hud] tax:list failed:', err);
  }
}

export async function fetchAndUpdateThefts(hud: HudElements): Promise<void> {
  try {
    const thefts = await getThefts();
    const pending = (thefts ?? []).filter(t => t.status === 'PENDING');
    hud.theftContainer.innerHTML = '';
    if (pending.length === 0) return;

    for (const theft of pending) {
      const card = document.createElement('div');
      card.className = 'hud-card hud-theft-card';

      const resolveAt = new Date(theft.resolveAt).getTime();
      const now = Date.now();
      const remainMs = Math.max(0, resolveAt - now);
      const remainMin = Math.floor(remainMs / 60_000);
      const remainSec = Math.floor((remainMs % 60_000) / 1000);

      const chanceColor = theft.chance === 'FORTE' ? '#4dff91' : theft.chance === 'MOYENNE' ? '#ffd866' : '#ff5555';

      card.innerHTML = `
        <div class="hud-theft-header">${ICONS.theft} VOL EN COURS</div>
        <div class="hud-theft-resource">${theft.resourceType}</div>
        <div class="hud-theft-info">
          <span>Mise: ${theft.moneySpent}$</span>
          <span style="color:${chanceColor}">${theft.chance}</span>
        </div>
        <div class="hud-theft-timer" data-resolve="${theft.resolveAt}">${remainMin}m ${remainSec}s</div>
      `;
      hud.theftContainer.appendChild(card);
    }
  } catch (err) {
    console.warn('[hud] theft:list failed:', err);
  }
}

export async function fetchAndUpdateMarketplace(hud: HudElements): Promise<void> {
  try {
    const offers = await getMarketplaceOffers();
    if (!offers || offers.length === 0) {
      hud.marketList.innerHTML = '<div class="hud-scroll-empty">Aucune offre</div>';
      return;
    }

    hud.marketList.innerHTML = '';
    // Show last 10 offers
    const displayed = offers.slice(0, 10);
    for (const offer of displayed) {
      const item = document.createElement('div');
      item.className = 'hud-market-item';

      const resIcon = offer.resourceType === 'FERONIUM' ? ICONS.feronium
        : offer.resourceType === 'BOISIUM' ? ICONS.boisium
        : ICONS.charbonium;

      item.innerHTML = `
        <div class="hud-market-res">${resIcon}</div>
        <div class="hud-market-details">
          <span class="hud-market-qty">${offer.quantityIn}</span>
          <span class="hud-market-price">${offer.pricePerResource}$/u</span>
        </div>
        <span class="hud-market-owner">${offer.owner.name}</span>
      `;
      hud.marketList.appendChild(item);
    }
  } catch (err) {
    console.warn('[hud] marketplace:offers failed:', err);
  }
}

export function startTheftCountdown(hud: HudElements): () => void {
  const interval = setInterval(() => {
    const timers = hud.theftContainer.querySelectorAll('.hud-theft-timer[data-resolve]');
    for (const el of timers) {
      const resolveAt = new Date((el as HTMLElement).dataset.resolve!).getTime();
      const remainMs = Math.max(0, resolveAt - Date.now());
      const mins = Math.floor(remainMs / 60_000);
      const secs = Math.floor((remainMs % 60_000) / 1000);
      el.textContent = remainMs > 0 ? `${mins}m ${secs}s` : 'Termine!';
      if (remainMs === 0) {
        (el as HTMLElement).style.color = '#4dff91';
      }
    }
  }, 1000);

  return () => clearInterval(interval);
}

export function setupBrokerActivityLog(hud: HudElements): () => void {
  return onBrokerEvent((raw: any) => {
    // Payload structure: { type, data: { type, message: {...} } }
    const type: string = raw?.type ?? raw?.data?.type ?? 'EVENT';
    const msg = raw?.data?.message ?? raw?.message ?? raw?.data ?? {};

    let text = '';
    let logType: 'info' | 'warn' | 'success' = 'info';

    switch (type) {
      case 'DISCOVERED_ISLAND': {
        const player = msg.playerName ?? '?';
        const island = msg.islandName ?? '?';
        const reward = msg.rewardMoney ?? 0;
        const pos = msg.position != null ? ` (#${msg.position})` : '';
        text = `${player} a decouvert ${island}${pos} — +${reward}$`;
        logType = 'success';
        break;
      }

      case 'ACHAT': {
        const content = msg.content ?? '';
        text = content || 'Achat effectue';
        logType = 'info';
        break;
      }

      case 'VENTE': {
        const content = msg.content ?? '';
        text = content || 'Vente effectuee';
        logType = 'info';
        break;
      }

      case 'OFFER_CREATED':
      case 'OFFER_UPDATED':
      case 'OFFER_DELETED': {
        const res = msg.resourceType ?? '';
        const qty = msg.quantityIn ?? '';
        const price = msg.pricePerResource ?? '';
        const owner = msg.owner?.name ?? '';
        const action = type === 'OFFER_CREATED' ? 'Nouvelle offre' : type === 'OFFER_UPDATED' ? 'Offre modifiee' : 'Offre supprimee';
        text = `${action}: ${qty} ${res} @ ${price}$/u${owner ? ' par ' + owner : ''}`;
        logType = 'info';
        break;
      }

      case 'THEFT_ATTACK':
      case 'THEFT_RESOLVED': {
        const res = msg.resourceType ?? '';
        const spent = msg.moneySpent ?? '';
        const chance = msg.chance ?? '';
        const status = msg.status ?? '';
        if (type === 'THEFT_ATTACK') {
          text = `Vol lance: ${res} (${spent}$, chance: ${chance})`;
          logType = 'warn';
        } else {
          const amount = msg.amountAttempted ?? 0;
          text = `Vol resolu: ${res} — ${status}${amount > 0 ? ' (+' + amount + ')' : ''}`;
          logType = status === 'SUCCESS' ? 'success' : 'warn';
        }
        break;
      }

      case 'TAX_CREATED':
      case 'TAX_PAID': {
        const amount = msg.amount ?? '';
        const taxType = msg.type ?? '';
        text = type === 'TAX_CREATED'
          ? `Nouvelle taxe ${taxType}: ${amount}$`
          : `Taxe ${taxType} payee: ${amount}$`;
        logType = 'warn';
        break;
      }

      case 'KNOWN_ISLAND': {
        const player = msg.playerName ?? '?';
        const island = msg.islandName ?? '?';
        text = `${player} a confirme l'ile ${island}`;
        logType = 'success';
        break;
      }

      default: {
        // Generic fallback — try to extract something useful
        const content = msg.content ?? msg.message ?? '';
        if (content) {
          text = `${type.replace(/_/g, ' ')}: ${content}`;
        } else {
          const player = msg.playerName ?? msg.owner?.name ?? '';
          const name = msg.islandName ?? msg.resourceType ?? msg.name ?? '';
          text = type.replace(/_/g, ' ');
          if (player) text += ` — ${player}`;
          if (name) text += `: ${name}`;
        }
        break;
      }
    }

    hud.pushActivity(text, logType);
  });
}
