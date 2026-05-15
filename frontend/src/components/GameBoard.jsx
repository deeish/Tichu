import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import Trick from './Trick';
import Card from './Card';
import CardBack from './CardBack';
import Drawer from './Drawer';
import HandDock from './HandDock';
import { GrandTichuHoldButton } from './GrandTichuHoldButton';
import HandErrorBoundary from './HandErrorBoundary';
import { sortCardsByRank, cardKey, isValidCard } from '../utils/cardUtils';
import { isTouchDevice } from '../utils/touchUtils';
import { DEBUG_HAND_DRAG } from '../debug';
import { reportClientError, setClientCorrelation } from '../clientErrorReport';
import {
  getDockHeight,
  getSidebarLayoutMode,
  getSidebarWidth,
  getCenterRect,
  getMatSize,
  getMatPosition,
  getSeatPositions,
  getWonPileCardSize,
  getExchangeCardSize,
  getDockCardSize,
  getMobileAwareTokens,
  TABLE_HEADER_HEIGHT,
  MAT_VERTICAL_BIAS,
  MAT_TOP_OFFSET,
  OUTER_MARGIN,
  SEAT_WIDTH,
  SEAT_HEIGHT,
  SEAT_MAT_GAP,
  WON_STACK_GAP,
  WISHED_CARD_PANEL_TOP,
} from '../styles/layoutTokens';
import '../styles/layout.css';
import '../styles/tableSurface.css';
import './GameBoard.css';

const THEME_STORAGE_KEY = 'tichu-table-theme';
const TURN_ALERTS_STORAGE_KEY = 'tichu-turn-alerts-enabled';
const THEMES = ['classic', 'velvet', 'midnight', 'ember', 'forest', 'ocean', 'sunset', 'royal', 'slate', 'autumn', 'jade', 'noir'];

/** Exchange-receipt card flight timing (cards only; labels are in the dock summary strip). */
const EXCHANGE_FLIGHT_DURATION_MS = 900;
const EXCHANGE_FLIGHT_STAGGER_MS = 130;

function formatExchangeCardShort(card) {
  if (!card || typeof card !== 'object') return '?';
  if (card.type === 'special') {
    const n = card.name || '';
    if (n === 'mahjong') return 'Mah Jong';
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : '?';
  }
  if (card.type === 'standard') {
    const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    return `${card.rank}${suits[card.suit] || ''}`;
  }
  return '?';
}

function exchangeFlightLabels(entry, seatKey) {
  const name = (entry?.fromPlayerName && String(entry.fromPlayerName).trim()) || 'Player';
  const role =
    entry?.isPartner === true
      ? 'Partner'
      : seatKey === 'left'
        ? 'Left'
        : seatKey === 'right'
          ? 'Right'
          : 'Across';
  return { role, name };
}

function exchangeSeatSortWeight(seatKey) {
  if (seatKey === 'left') return 0;
  if (seatKey === 'top') return 1; // Partner/across (middle in recap)
  if (seatKey === 'right') return 2;
  return 3;
}

function GameBoard({ game, socket, playerId, isConnected = true, onResyncGame, onBackToLobby = null }) {
  // ----- UI state (do not reset on game update unless invalidated) -----
  const [tableTheme, setTableTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return THEMES.includes(saved) ? saved : 'velvet';
    } catch {
      return 'velvet';
    }
  });
  const handleTableThemeChange = useCallback((theme) => {
    setTableTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_) {}
  }, []);
  const [turnAlertsEnabled, setTurnAlertsEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(TURN_ALERTS_STORAGE_KEY);
      if (raw == null) return true;
      return raw !== '0' && raw !== 'false';
    } catch {
      return true;
    }
  });
  const [selectedCards, setSelectedCards] = useState([]);
  const [sortMode, setSortMode] = useState('desc');
  const [mahJongWish, setMahJongWish] = useState('');
  const [showWishInput, setShowWishInput] = useState(false);
  const [exchangeAssignments, setExchangeAssignments] = useState([null, null, null]);
  const [exchangePendingCard, setExchangePendingCard] = useState(null);
  const [exchangeDragOverSlot, setExchangeDragOverSlot] = useState(null);
  const [exchangeDraggingIndex, setExchangeDraggingIndex] = useState(null);
  const [exchangeSubmitted, setExchangeSubmitted] = useState(false);
  // Manual hand ordering preference:
  // array of stable card identity keys (see `cardKey(card)`).
  // We keep it across plays/resyncs by remapping keys onto the latest displayHand.
  const [handOrderPreferenceKeys, setHandOrderPreferenceKeys] = useState(null);
  // Optimistic glow for Tichu buttons so click/unclick feels instant; cleared when game state updates
  const [optimisticTichu, setOptimisticTichu] = useState(null);
  const [optimisticGrandTichu, setOptimisticGrandTichu] = useState(null);
  const [grandTichuSubmitting, setGrandTichuSubmitting] = useState(false);
  const [showTichuWarning, setShowTichuWarning] = useState(null); // null | 'teammate' | 'finished'

  // UI toggle for upcoming auto-pass feature.
  // Gameplay auto-pass uses a conservative server-aligned eligibility check (see effect below).
  const [autoPassUIEnabled, setAutoPassUIEnabled] = useState(false);
  const autoPassTimerRef = useRef(null);
  const autoPassScheduledTurnSigRef = useRef(null);
  const autoPassResetRoundKeyRef = useRef(null);

  const layoutRef = useRef(null);
  const tableRef = useRef(null);
  const tableSurfaceRef = useRef(null);
  const dockWrapperRef = useRef(null);
  const lastExchangeFlightSigRef = useRef(null);
  const sidebarRef = useRef(null);
  const lastTableSizeRef = useRef({ w: 0, h: 0 });
  const lastDockWrapperSizeRef = useRef({ w: 0, h: 0 });
  const lastSidebarSizeRef = useRef({ w: 0, h: 0 });
  const [tableSize, setTableSize] = useState({ w: 0, h: 0 });
  const [dockWrapperSize, setDockWrapperSize] = useState({ w: 0, h: 0 });
  const [sidebarSize, setSidebarSize] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1600,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : getSidebarLayoutMode(window.innerWidth) === 'side'
  );
  /** Incoming exchange cards flying from seats → hand (client-only animation). */
  const [exchangeFlights, setExchangeFlights] = useState(null);
  /** Dragon pass-out visual: center mat -> selected opponent won stack. */
  const [dragonPassFlight, setDragonPassFlight] = useState(null);
  const [exchangeReceiptSummaryDismissed, setExchangeReceiptSummaryDismissed] = useState(false);
  const [dragonPassNotice, setDragonPassNotice] = useState(null);
  const [dragonPassNoticeDismissed, setDragonPassNoticeDismissed] = useState(false);
  const [turnAlertLevel, setTurnAlertLevel] = useState(0);
  const exchangeReceiptSummarySigRef = useRef(null);
  const dragonSelectionPrevRef = useRef(null);
  const prevStackSnapshotRef = useRef({});
  const dragonPassSigRef = useRef(null);
  const turnAlertTimerRef = useRef(null);
  const turnLastInteractionAtRef = useRef(0);
  const turnPrevLevelRef = useRef(0);
  const wasMyTurnRef = useRef(false);

  const isMyTurn = useMemo(() => {
    if (!game?.turnOrder) return false;
    const current = game.turnOrder[game.currentPlayerIndex];
    return current?.id === playerId;
  }, [game?.turnOrder, game?.currentPlayerIndex, playerId]);

  const teammateCalledTichu = useMemo(() => {
    if (!game?.players) return false;
    const myTeam = game.players.find(p => p.id === playerId)?.team;
    const teammate = game.players.find(p => p.team === myTeam && p.id !== playerId);
    return game.tichuDeclarations?.[teammate?.id] === true || game.grandTichuDeclarations?.[teammate?.id] === true;
  }, [game?.players, game?.tichuDeclarations, game?.grandTichuDeclarations, playerId]);

  const someoneElseFinished = useMemo(
    () => Array.isArray(game?.playersOut) && game.playersOut.some(id => id !== playerId),
    [game?.playersOut, playerId]
  );

  const turnAlertActive = game?.state === 'playing' && isMyTurn && turnAlertsEnabled;

  const noteTurnInteraction = useCallback(() => {
    if (!turnAlertActive) return;
    turnLastInteractionAtRef.current = Date.now();
    if (turnPrevLevelRef.current !== 0) {
      turnPrevLevelRef.current = 0;
      setTurnAlertLevel(0);
    }
  }, [turnAlertActive]);

  useEffect(() => {
    try {
      localStorage.setItem(TURN_ALERTS_STORAGE_KEY, turnAlertsEnabled ? '1' : '0');
    } catch (_) {}
  }, [turnAlertsEnabled]);

  useEffect(() => {
    const becameMyTurn = turnAlertActive && !wasMyTurnRef.current;
    wasMyTurnRef.current = turnAlertActive;
    if (!becameMyTurn) return;
    // Turn transition hook kept for future turn-start cues.
  }, [turnAlertActive]);

  useEffect(() => {
    // Escalation phases (no interaction): 6s -> level 1, 11s -> level 2.
    // Cap at 2 reminders/turn and immediately cool down when user interacts.
    if (!turnAlertActive) {
      if (turnAlertTimerRef.current) {
        clearInterval(turnAlertTimerRef.current);
        turnAlertTimerRef.current = null;
      }
      turnPrevLevelRef.current = 0;
      setTurnAlertLevel(0);
      return;
    }
    turnLastInteractionAtRef.current = Date.now();
    turnPrevLevelRef.current = 0;
    setTurnAlertLevel(0);
    if (turnAlertTimerRef.current) clearInterval(turnAlertTimerRef.current);
    turnAlertTimerRef.current = setInterval(() => {
      // If user is actively evaluating cards, stay subtle and do not escalate.
      if (selectedCards.length > 0) {
        turnLastInteractionAtRef.current = Date.now();
        if (turnPrevLevelRef.current !== 0) {
          turnPrevLevelRef.current = 0;
          setTurnAlertLevel(0);
        }
        return;
      }
      const idleMs = Date.now() - turnLastInteractionAtRef.current;
      const nextLevel = idleMs >= 11000 ? 2 : idleMs >= 6000 ? 1 : 0;
      if (nextLevel !== turnPrevLevelRef.current) {
        turnPrevLevelRef.current = nextLevel;
        setTurnAlertLevel(nextLevel);
      }
    }, 1000);
    return () => {
      if (turnAlertTimerRef.current) {
        clearInterval(turnAlertTimerRef.current);
        turnAlertTimerRef.current = null;
      }
    };
  }, [turnAlertActive, selectedCards.length]);

  useEffect(() => {
    if (!turnAlertActive) return undefined;
    const onPointerDown = () => noteTurnInteraction();
    const onKeyDown = () => noteTurnInteraction();
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [turnAlertActive, noteTurnInteraction]);

  useEffect(() => {
    return () => {
      if (turnAlertTimerRef.current) {
        clearInterval(turnAlertTimerRef.current);
        turnAlertTimerRef.current = null;
      }
    };
  }, []);

  // Clear optimistic state only when server confirms undeclared (falsy). Avoid clearing on
  // every update so a stale game-update (e.g. from a bot move) doesn’t bring the glow back after unclick.
  useEffect(() => {
    if (game?.tichuDeclarations?.[playerId] == null) setOptimisticTichu(null);
  }, [game?.tichuDeclarations?.[playerId], playerId]);
  useEffect(() => {
    if (game?.grandTichuDeclarations?.[playerId] == null) setOptimisticGrandTichu(null);
  }, [game?.grandTichuDeclarations?.[playerId], playerId]);
  useEffect(() => {
    if (game?.state !== 'grand-tichu' || game?.cardsRevealed?.[playerId]) {
      setGrandTichuSubmitting(false);
    }
  }, [game?.state, game?.cardsRevealed?.[playerId], playerId]);

  // Start each round with auto-pass OFF. Key by roundLog length so it runs once per new round.
  useEffect(() => {
    if (!game?.id || game?.state !== 'grand-tichu') return;
    const roundCount = Array.isArray(game?.roundLog) ? game.roundLog.length : 0;
    const roundKey = `${game.id}:${roundCount}`;
    if (autoPassResetRoundKeyRef.current === roundKey) return;
    autoPassResetRoundKeyRef.current = roundKey;
    setAutoPassUIEnabled(false);
    if (autoPassTimerRef.current) {
      clearTimeout(autoPassTimerRef.current);
      autoPassTimerRef.current = null;
    }
    autoPassScheduledTurnSigRef.current = null;
  }, [game?.id, game?.state, game?.roundLog]);

  // Sync measured viewport (single source for responsive sidebar mode).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      setViewport((prev) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sidebarMode = useMemo(() => getSidebarLayoutMode(viewport.w), [viewport.w]);
  const sidebarW = useMemo(() => (sidebarMode === 'overlay' ? 0 : getSidebarWidth(viewport.w)), [sidebarMode, viewport.w]);
  const dockH = useMemo(() => getDockHeight(), [viewport.h]);
  const isTouch = isTouchDevice();
  const mobileTokens = useMemo(() => getMobileAwareTokens(viewport.w), [viewport.w]);

  // Keep sidebar open on desktop, keep previous user toggle in overlay mode.
  useEffect(() => {
    if (sidebarMode === 'side') setIsSidebarOpen(true);
  }, [sidebarMode]);

  // Sync computed layout CSS vars.
  useEffect(() => {
    const root = layoutRef.current;
    if (!root) return;
    root.style.setProperty('--dock-h', `${dockH}px`);
    root.style.setProperty('--sidebar-w', `${sidebarW}px`);
  }, [dockH, sidebarW]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width == null || height == null) return;
      const prev = lastTableSizeRef.current;
      if (prev.w === width && prev.h === height) return;
      lastTableSizeRef.current = { w: width, h: height };
      setTableSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = dockWrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width == null || height == null) return;
      const prev = lastDockWrapperSizeRef.current;
      if (prev.w === width && prev.h === height) return;
      lastDockWrapperSizeRef.current = { w: width, h: height };
      setDockWrapperSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width == null || height == null) return;
      const prev = lastSidebarSizeRef.current;
      if (prev.w === width && prev.h === height) return;
      lastSidebarSizeRef.current = { w: width, h: height };
      setSidebarSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sidebarMode, isSidebarOpen]);

  // Clear selection only when phase changes or selected cards no longer in hand.
  // Use stable hand signature so this effect doesn't run on every game-update (avoids flicker).
  const myHand = Array.isArray(game?.hands?.[playerId]) ? game?.hands?.[playerId] : [];
  const handSignature = useMemo(
    () => (game?.state === 'playing' || game?.state === 'exchanging' ? `${myHand.length}:${myHand.map(cardKey).join(',')}` : ''),
    [game?.state, myHand]
  );
  const onResyncGameRef = useRef(onResyncGame)
  const actionSeqRef = useRef(0)
  const nextActionId = () => {
    actionSeqRef.current += 1
    return `${Date.now()}-${actionSeqRef.current}`
  }
  useEffect(() => {
    onResyncGameRef.current = onResyncGame
  }, [onResyncGame])
  useEffect(() => {
    if (game?.state !== 'playing' && game?.state !== 'exchanging') {
      setSelectedCards([]);
      return;
    }
    // Clear selection when entering exchange so no card shows as "selected" during exchange.
    if (game?.state === 'exchanging') {
      setSelectedCards([]);
      return;
    }
    const stillInHand = (c) =>
      myHand.some(
        (h) =>
          h.type === c.type &&
          (h.type === 'standard' ? h.suit === c.suit && h.rank === c.rank : h.name === c.name)
      );
    setSelectedCards((prev) => {
      const next = prev.filter(stillInHand);
      // Likely desync: we still had a selection but it no longer exists in our current hand.
      // Trigger a full state refresh (with backoff implemented in App.jsx).
      if (game?.state === 'playing' && prev.length > 0 && next.length !== prev.length) {
        onResyncGameRef.current?.('desync-selected-not-in-hand');
      }
      return next;
    });
  }, [game?.state, handSignature]);

  useEffect(() => {
    if (game?.state !== 'exchanging') {
      setExchangeAssignments([null, null, null]);
      setExchangePendingCard(null);
      setExchangeDraggingIndex(null);
      setExchangeSubmitted(false);
    }
    if (game?.state === 'exchanging' || game?.state === 'grand-tichu') {
      setDragonPassNotice(null);
      setDragonPassNoticeDismissed(false);
    }
  }, [game?.state]);

  // Clear manual hand ordering only on real phase transitions that swap out the hand set.
  // We intentionally DO NOT clear on every handSignature change, because that breaks
  // "sort/filter + manual reorder persists after play" and resync recovery.
  useEffect(() => {
    if (!game) return;
    if (game.state === 'exchanging' || game.state === 'grand-tichu') {
      setHandOrderPreferenceKeys(null);
    }
  }, [game?.state]);

  // Clear exchange drag when tab/window hidden or window loses focus (avoids stuck state when switching screen/tab)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setExchangeDraggingIndex((prev) => {
          if (prev != null && DEBUG_HAND_DRAG) console.log('[GameBoard] visibility hidden – clearing exchange drag');
          return null;
        });
        setExchangeDragOverSlot(null);
      }
    };
    const onWindowBlur = () => {
      setExchangeDraggingIndex((prev) => {
        if (prev != null && DEBUG_HAND_DRAG) console.log('[GameBoard] window blur – clearing exchange drag');
        return null;
      });
      setExchangeDragOverSlot(null);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const centerRect = useMemo(
    () => getCenterRect(tableSize.w, tableSize.h, dockH, sidebarW, {
      leftBand: mobileTokens.leftBand,
      topBand: mobileTokens.topBand,
    }),
    [tableSize.w, tableSize.h, dockH, sidebarW, mobileTokens.leftBand, mobileTokens.topBand]
  );

  // Development-only geometry overlay (query param or localStorage flag).
  // Example: `?geomDebug=1`
  const geomDebug = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('geomDebug') === '1') return true;
      return localStorage.getItem('geomDebug') === '1';
    } catch {
      return false;
    }
  }, []);
  const matSize = useMemo(
    () => getMatSize(centerRect.w, centerRect.h),
    [centerRect.w, centerRect.h]
  );
  const matPosition = useMemo(
    () => getMatPosition(centerRect, matSize.w, matSize.h),
    [centerRect, matSize.w, matSize.h, MAT_VERTICAL_BIAS, MAT_TOP_OFFSET]
  );
  const seatPositions = useMemo(
    () => getSeatPositions(tableSize.w, tableSize.h, dockH, sidebarW, matPosition, matSize, {
      seatWidth: mobileTokens.seatWidth,
      seatHeight: mobileTokens.seatHeight,
      outerMargin: mobileTokens.outerMargin,
      tableHeaderHeight: mobileTokens.tableHeaderHeight,
      leftBand: mobileTokens.leftBand,
    }),
    [tableSize.w, tableSize.h, dockH, sidebarW, matPosition, matSize, mobileTokens.seatWidth, mobileTokens.seatHeight, mobileTokens.outerMargin, mobileTokens.tableHeaderHeight, mobileTokens.leftBand]
  );

  // Expose computed geometry to CSS (used for trick scroll sizing, etc.).
  // Use layout effect to avoid a "one paint behind" mismatch on fast resizes.
  useLayoutEffect(() => {
    const root = layoutRef.current;
    if (!root) return;
    root.style.setProperty('--mat-w', `${matSize.w}px`);
    root.style.setProperty('--mat-h', `${matSize.h}px`);
  }, [matSize.w, matSize.h]);

  const opponentsByPosition = useMemo(() => {
    const order = game?.turnOrder?.length >= 4 ? game.turnOrder : game?.players ?? [];
    const seenIds = new Set();
    const uniqueOrder = order.filter((p) => {
      if (!p?.id || seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
    const n = uniqueOrder.length;
    const myIndex = uniqueOrder.findIndex((p) => p.id === playerId);
    if (myIndex === -1 || n < 3) {
      const others = (game?.players ?? []).filter((p) => p?.id && p.id !== playerId);
      return { left: others[0] ?? null, top: others[1] ?? null, right: others[2] ?? null };
    }
    return {
      left: uniqueOrder[(myIndex + 1) % n] ?? null,
      top: uniqueOrder[(myIndex + 2) % n] ?? null,
      right: uniqueOrder[(myIndex + 3) % n] ?? null,
    };
  }, [game?.turnOrder, game?.players, playerId]);

  const exchangeReceiptSummaryLines = useMemo(() => {
    const receipt = game?.exchangeReceipt;
    if (game?.state !== 'playing' || !Array.isArray(receipt) || receipt.length === 0) return [];
    return receipt.map((entry, idx) => {
      const fromId = entry.fromPlayerId;
      let seatKey = 'top';
      for (const k of ['left', 'top', 'right']) {
        if (opponentsByPosition[k]?.id === fromId) {
          seatKey = k;
          break;
        }
      }
      const { role, name } = exchangeFlightLabels(entry, seatKey);
      return {
        key: `${String(fromId)}-${idx}-${formatExchangeCardShort(entry.card)}`,
        seatKey,
        seatSortWeight: exchangeSeatSortWeight(seatKey),
        role,
        name,
        cardLabel: formatExchangeCardShort(entry.card),
      };
    }).sort((a, b) => a.seatSortWeight - b.seatSortWeight);
  }, [game?.state, game?.exchangeReceipt, opponentsByPosition]);

  useEffect(() => {
    lastExchangeFlightSigRef.current = null;
  }, [game?.id]);

  useEffect(() => {
    // New game -> clear dragon pass notice + tracking snapshots.
    setDragonPassNotice(null);
    setDragonPassNoticeDismissed(false);
    dragonSelectionPrevRef.current = null;
    prevStackSnapshotRef.current = {};
    dragonPassSigRef.current = null;
  }, [game?.id]);

  useEffect(() => {
    const sig =
      game?.state !== 'playing' || !Array.isArray(game?.exchangeReceipt) || game.exchangeReceipt.length === 0
        ? null
        : JSON.stringify(game.exchangeReceipt);
    if (sig !== exchangeReceiptSummarySigRef.current) {
      exchangeReceiptSummarySigRef.current = sig;
      setExchangeReceiptSummaryDismissed(false);
    }
  }, [game?.state, game?.exchangeReceipt]);

  useEffect(() => {
    const players = Array.isArray(game?.players) ? game.players : [];
    const currStacks = game?.playerStacks && typeof game.playerStacks === 'object' ? game.playerStacks : {};
    const currSnapshot = {};
    for (const p of players) {
      const s = currStacks?.[p.id];
      currSnapshot[p.id] = {
        cards: Array.isArray(s?.cards) ? s.cards.length : 0,
        points: Number.isFinite(Number(s?.points)) ? Number(s.points) : 0,
      };
    }
    const prevSelection = dragonSelectionPrevRef.current;
    const currSelection = game?.dragonOpponentSelection ?? null;

    // Dragon selection just resolved -> infer selected recipient from stack delta and animate.
    if (prevSelection && !currSelection && game?.state === 'playing') {
      const prevSnapshot = prevStackSnapshotRef.current || {};
      const trickCards = Array.isArray(prevSelection?.trickCards) ? prevSelection.trickCards : [];
      const trickCardCount = trickCards.length;
      const trickPoints = Number.isFinite(Number(prevSelection?.trickPoints)) ? Number(prevSelection.trickPoints) : null;

      let recipientId = null;
      let bestCardDelta = -1;
      for (const p of players) {
        const before = prevSnapshot[p.id]?.cards ?? 0;
        const after = currSnapshot[p.id]?.cards ?? 0;
        const cardDelta = after - before;
        if (cardDelta > bestCardDelta) {
          bestCardDelta = cardDelta;
          recipientId = p.id;
        }
      }

      // Fallback by points if card-delta signal is weak.
      if (!recipientId || (trickCardCount > 0 && bestCardDelta < trickCardCount)) {
        let bestPointDelta = Number.NEGATIVE_INFINITY;
        for (const p of players) {
          const beforePts = prevSnapshot[p.id]?.points ?? 0;
          const afterPts = currSnapshot[p.id]?.points ?? 0;
          const pointDelta = afterPts - beforePts;
          if (pointDelta > bestPointDelta) {
            bestPointDelta = pointDelta;
            recipientId = p.id;
          }
        }
      }

      if (recipientId) {
        const recipient = players.find((p) => p.id === recipientId);
        const role =
          recipientId === playerId
            ? 'You'
            : opponentsByPosition.left?.id === recipientId
              ? 'Left'
              : opponentsByPosition.right?.id === recipientId
                ? 'Right'
                : 'Partner';
        const recipientName = recipient?.name || 'Player';
        const sig = `${game?.id ?? 'game'}:${prevSelection.playerId}:${recipientId}:${trickCardCount}:${trickPoints ?? 'np'}`;
        if (dragonPassSigRef.current !== sig) {
          dragonPassSigRef.current = sig;
          setDragonPassNotice({
            key: sig,
            text: `Dragon trick passed to ${recipientName} (${role}).`,
          });
          setDragonPassNoticeDismissed(false);

          const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reduced && tableSurfaceRef.current) {
            const sRect = tableSurfaceRef.current.getBoundingClientRect();
            const dragonWonCardSize = getWonPileCardSize(centerRect?.w ?? tableSize.w ?? 1200);
            const fromX = sRect.left + matPosition.x + matSize.w / 2;
            const fromY = sRect.top + matPosition.y + matSize.h / 2;
            let toX = fromX;
            let toY = fromY;
            if (recipientId === playerId) {
              const myWonLeft = (tableSize.w - dragonWonCardSize.w) / 2;
              const myWonTop = tableSize.h - dragonWonCardSize.h - WON_STACK_GAP;
              toX = sRect.left + myWonLeft + dragonWonCardSize.w / 2;
              toY = sRect.top + myWonTop + dragonWonCardSize.h / 2;
            } else {
              let seatKey = null;
              if (opponentsByPosition.top?.id === recipientId) seatKey = 'top';
              if (opponentsByPosition.left?.id === recipientId) seatKey = 'left';
              if (opponentsByPosition.right?.id === recipientId) seatKey = 'right';
              if (seatKey && seatPositions[seatKey]) {
                const posObj = seatPositions[seatKey];
                const isTop = seatKey === 'top';
                const wonStackLeft = isTop
                  ? posObj.x + mobileTokens.seatWidth + WON_STACK_GAP
                  : posObj.x + (mobileTokens.seatWidth - dragonWonCardSize.w) / 2;
                const wonStackTop = isTop
                  ? posObj.y + (mobileTokens.seatHeight - dragonWonCardSize.h) / 2
                  : posObj.y + mobileTokens.seatHeight + WON_STACK_GAP;
                toX = sRect.left + wonStackLeft + dragonWonCardSize.w / 2;
                toY = sRect.top + wonStackTop + dragonWonCardSize.h / 2;
              }
            }
            setDragonPassFlight({
              id: Date.now(),
              fromX,
              fromY,
              dx: toX - fromX,
              dy: toY - fromY,
              w: dragonWonCardSize.w,
              h: dragonWonCardSize.h,
              arrived: false,
            });
          }
        }
      }
    }

    dragonSelectionPrevRef.current = currSelection ? { ...currSelection } : null;
    prevStackSnapshotRef.current = currSnapshot;
  }, [
    game?.id,
    game?.state,
    game?.dragonOpponentSelection,
    game?.playerStacks,
    game?.players,
    playerId,
    opponentsByPosition,
    seatPositions,
    tableSize.w,
    tableSize.h,
    centerRect?.w,
    matPosition.x,
    matPosition.y,
    matSize.w,
    matSize.h,
  ]);

  useLayoutEffect(() => {
    const receipt = game?.exchangeReceipt;
    if (!game || game.state !== 'playing' || !Array.isArray(receipt) || receipt.length === 0) return;

    const sig = JSON.stringify(receipt);
    if (sig === lastExchangeFlightSigRef.current) return;

    const surfaceEl = tableSurfaceRef.current;
    const dockEl = dockWrapperRef.current;
    if (!surfaceEl || !dockEl) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lastExchangeFlightSigRef.current = sig;
    if (reduced) return;

    const sRect = surfaceEl.getBoundingClientRect();
    const dockRect = dockEl.getBoundingClientRect();
    const basis =
      dockEl.clientWidth > 40
        ? dockEl.clientWidth
        : tableRef.current?.clientWidth > 40
          ? tableRef.current.clientWidth
          : typeof window !== 'undefined'
            ? window.innerWidth
            : 1200;
    const cardSz = getDockCardSize(basis);
    const w = Math.round(cardSz.w * 0.9);
    const h = Math.round(cardSz.h * 0.9);

    const toXBase = dockRect.left + dockRect.width / 2;
    const toY = dockRect.top + Math.min(dockRect.height * 0.28, 72);

    const items = receipt.map((entry, index) => {
      const fromId = entry.fromPlayerId;
      let seatKey = 'top';
      for (const k of ['left', 'top', 'right']) {
        if (opponentsByPosition[k]?.id === fromId) {
          seatKey = k;
          break;
        }
      }
      const pos = seatPositions[seatKey];
      const fromX = sRect.left + pos.x + mobileTokens.seatWidth / 2;
      const fromY = sRect.top + pos.y + mobileTokens.seatHeight / 2;
      const fan = (index - 1) * 26;
      const toX = toXBase + fan;
      return {
        card: entry.card,
        fromX,
        fromY,
        dx: toX - fromX,
        dy: toY - fromY,
        delay: index * EXCHANGE_FLIGHT_STAGGER_MS,
        w,
        h,
        arrived: false,
      };
    });

    setExchangeFlights({ id: Date.now(), items });
  }, [game, game?.exchangeReceipt, game?.state, opponentsByPosition, seatPositions]);

  useLayoutEffect(() => {
    if (!exchangeFlights?.items?.length) return;
    const id = exchangeFlights.id;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setExchangeFlights((prev) => {
          if (!prev || prev.id !== id) return prev;
          return { ...prev, items: prev.items.map((x) => ({ ...x, arrived: true })) };
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
    };
  }, [exchangeFlights?.id]);

  useLayoutEffect(() => {
    if (!dragonPassFlight) return;
    const id = dragonPassFlight.id;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setDragonPassFlight((prev) => {
          if (!prev || prev.id !== id) return prev;
          return { ...prev, arrived: true };
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
    };
  }, [dragonPassFlight?.id]);

  useEffect(() => {
    if (!exchangeFlights?.items?.length) return;
    const maxD = Math.max(0, ...exchangeFlights.items.map((i) => i.delay));
    const t = window.setTimeout(() => setExchangeFlights(null), maxD + EXCHANGE_FLIGHT_DURATION_MS + 120);
    return () => clearTimeout(t);
  }, [exchangeFlights?.id]);

  useEffect(() => {
    if (!dragonPassFlight) return;
    const t = window.setTimeout(() => setDragonPassFlight(null), 1020);
    return () => clearTimeout(t);
  }, [dragonPassFlight?.id]);

  const exchangeRecipients = game?.exchangeRecipients ?? [];
  const cardMatches = (a, b) =>
    a && b && a.type === b.type && (a.type === 'standard' ? a.suit === b.suit && a.rank === b.rank : a.name === b.name);
  const lastReportedInvalidRef = useRef(null);
  const displayHand = useMemo(() => {
    const raw = (myHand || []).filter(Boolean);
    const invalid = raw.filter((c) => !isValidCard(c));
    const safeHand = raw.filter(isValidCard);
    if (invalid.length > 0) {
      const key = JSON.stringify(invalid.map((c) => ({ type: c?.type, suit: c?.suit, rank: c?.rank, name: c?.name })));
      if (lastReportedInvalidRef.current !== key) {
        lastReportedInvalidRef.current = key;
        const payload = {
          source: 'handValidation',
          message: 'Invalid cards filtered from hand (check server terminal or localStorage tichu_debug_invalid_hand)',
          invalidCards: invalid.slice(0, 20),
          filteredCount: invalid.length,
          handLengthBefore: raw.length,
          gameState: game?.state,
        };
        reportClientError(payload);
        try {
          localStorage.setItem('tichu_debug_invalid_hand', JSON.stringify({ t: Date.now(), ...payload }));
        } catch (_) {}
      }
    } else {
      lastReportedInvalidRef.current = null;
    }
    if (!safeHand.length) return safeHand;
    let base = safeHand;
    // During exchange, never show in hand the cards we've assigned to slots or that the server has recorded as our exchange
    if (game?.state === 'exchanging') {
      const fromSlots = exchangeAssignments.filter(Boolean);
      const fromServer = game?.exchangeCards?.[playerId] && Array.isArray(game.exchangeCards[playerId]) ? game.exchangeCards[playerId] : [];
      const toHide = [...fromSlots];
      for (const c of fromServer) {
        if (c && !toHide.some((a) => cardMatches(a, c))) toHide.push(c);
      }
      if (toHide.length > 0) {
        base = safeHand.filter((c) => !toHide.some((a) => cardMatches(a, c)));
      }
    }
    try {
      if (sortMode === 'asc') return sortCardsByRank(base, true);
      if (sortMode === 'desc') return sortCardsByRank(base, false);
      return base;
    } catch {
      return base;
    }
  }, [myHand, sortMode, game?.state, exchangeAssignments, game?.exchangeCards, playerId]);

  const orderedHand = useMemo(() => {
    if (!displayHand?.length) return displayHand;
    if (!Array.isArray(handOrderPreferenceKeys) || handOrderPreferenceKeys.length === 0) return displayHand;

    // Remap the key preference onto the latest displayHand.
    // - Consume in preference order for keys that still exist in displayHand.
    // - Append any remaining cards (not mentioned in preference) at the end, preserving
    //   their current relative order from displayHand.
    const queues = {};
    for (const c of displayHand) {
      const k = cardKey(c);
      if (!queues[k]) queues[k] = [];
      queues[k].push(c);
    }

    const ordered = [];
    const used = new Set(); // indexes in displayHand are not available; mark by object identity

    // Consume preference
    for (const k of handOrderPreferenceKeys) {
      const q = queues[k];
      if (q && q.length > 0) {
        const c = q.shift();
        if (c) {
          ordered.push(c);
          used.add(c);
        }
      }
    }

    // Append leftovers
    for (const c of displayHand) {
      if (!used.has(c)) ordered.push(c);
    }

    // Safety: avoid returning arrays with null/undefined
    return ordered.filter(Boolean);
  }, [displayHand, handOrderPreferenceKeys]);

  const handleSortModeChange = useCallback((mode) => {
    noteTurnInteraction();
    setSortMode(mode);
    setHandOrderPreferenceKeys(null);
  }, [noteTurnInteraction]);

  const handleHandReorder = useCallback((newOrderedCards) => {
    noteTurnInteraction();
    if (!Array.isArray(newOrderedCards) || newOrderedCards.length === 0) {
      setHandOrderPreferenceKeys(null);
      return;
    }
    // Store a stable key sequence so we can remap it after plays/resyncs.
    setHandOrderPreferenceKeys(newOrderedCards.map((c) => cardKey(c)));
  }, [noteTurnInteraction]);

  // When Dragon selection is pending, the dragon player is still "acting" until they choose; show their turn.
  const turnOrderCurrent = game?.turnOrder?.[game?.currentPlayerIndex];
  const currentPlayer = game?.dragonOpponentSelection
    ? (game?.turnOrder ?? []).find((p) => p.id === game.dragonOpponentSelection?.playerId) ?? turnOrderCurrent
    : turnOrderCurrent;

  const isBomb = useCallback(() => {
    if (selectedCards.length < 4) return false;
    if (selectedCards.length === 4) {
      // Four-of-a-kind bomb must be exactly four STANDARD cards of same rank.
      // Phoenix cannot be used to create a bomb.
      const allStandard = selectedCards.every((c) => c?.type === 'standard' && typeof c?.rank === 'string');
      if (!allStandard) return false;
      const ranks = selectedCards.map((c) => c.rank);
      if (new Set(ranks).size === 1) return true;
    }
    if (selectedCards.length >= 5) {
      // Straight-flush bomb must also be all standard cards (no Phoenix/specials).
      if (!selectedCards.every((c) => c?.type === 'standard' && typeof c?.rank === 'string' && typeof c?.suit === 'string')) {
        return false;
      }
      const standard = selectedCards.filter((c) => c.type === 'standard');
      if (standard.length === 0) return false;
      if (new Set(standard.map((c) => c.suit)).size === 1) return true;
    }
    return false;
  }, [selectedCards]);

  const handleCardClick = (card) => {
    try {
      noteTurnInteraction();
      if (!card || typeof card !== 'object') return;
      const validCard =
        (card.type === 'standard' && card.suit && card.rank) ||
        (card.type === 'special' && card.name);
      if (!validCard) return;

      if (game?.state === 'exchanging') {
        if (isTouch) {
          // Touch: two-tap flow — tap card to stage it, then tap a seat to assign it.
          // Tapping the same pending card deselects it.
          setExchangePendingCard((prev) => (prev && cardMatches(prev, card) ? null : card));
          return;
        }
        // Desktop: assign to next empty slot on click.
        setExchangeAssignments((prev) => {
          const i = prev.findIndex((x) => !x);
          if (i === -1) return prev;
          const n = [...prev];
          n[i] = card;
          return n;
        });
        return;
      }
      if (game?.state !== 'playing') return;

      const isSelected = selectedCards.some(
        (s) =>
          s.type === card.type &&
          (s.type === 'standard' ? s.suit === card.suit && s.rank === card.rank : s.name === card.name)
      );
      if (isSelected) {
        setSelectedCards((prev) =>
          prev.filter(
            (s) =>
              !(s.type === card.type && (s.type === 'standard' ? s.suit === card.suit && s.rank === card.rank : s.name === card.name))
          )
        );
      } else {
        setSelectedCards((prev) => [...prev, card]);
      }
    } catch (err) {
      console.error('[GameBoard] handleCardClick', err);
      reportClientError({
        source: 'GameBoard',
        message: err?.message ?? String(err),
        stack: err?.stack,
        context: 'handleCardClick',
      });
    }
  };

  const handleRemoveFromSlot = (i) => {
    try {
      const idx = Math.max(0, Math.min(Number(i), 2));
      setExchangeAssignments((prev) => {
        const n = Array.isArray(prev) ? [...prev] : [null, null, null];
        n[idx] = null;
        return n.slice(0, 3);
      });
    } catch (err) {
      console.error('[GameBoard] handleRemoveFromSlot', err);
      reportClientError({
        source: 'GameBoard',
        message: err?.message ?? String(err),
        stack: err?.stack,
        context: 'handleRemoveFromSlot',
      });
    }
  };

  const handleDropOnSlot = (slotIndex, card) => {
    try {
      if (DEBUG_HAND_DRAG) console.log('[GameBoard] exchange DROP', { slotIndex, card: cardKey(card) });
      const idx = Math.max(0, Math.min(Number(slotIndex), 2));
      const validCard = card && typeof card === 'object' && ((card.type === 'standard' && card.suit && card.rank) || (card.type === 'special' && card.name));
      setExchangeAssignments((prev) => {
        const n = Array.isArray(prev) ? [...prev] : [null, null, null];
        n[idx] = validCard ? card : null;
        return n.slice(0, 3);
      });
    } catch (err) {
      console.error('[GameBoard] handleDropOnSlot', err);
      reportClientError({
        source: 'GameBoard',
        message: err?.message ?? String(err),
        stack: err?.stack,
        context: 'handleDropOnSlot',
      });
    }
    setExchangeDragOverSlot(null);
    setExchangeDraggingIndex(null);
  };

  const handleExchangeDragStart = (e, card, index) => {
    try {
      if (DEBUG_HAND_DRAG) console.log('[GameBoard] exchange drag START', { index, card: cardKey(card) });
      try {
        const data = JSON.stringify(card);
        e.dataTransfer?.setData('tichu/card', data);
        e.dataTransfer?.setData('text/plain', data);
      } catch (_) {
        e.dataTransfer?.setData('text/plain', String(card?.name ?? card?.rank ?? ''));
      }
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      const cardEl = (e.target?.closest?.('.card')) || e.target;
      if (cardEl?.getBoundingClientRect) {
        const rect = cardEl.getBoundingClientRect();
        e.dataTransfer?.setDragImage?.(cardEl, e.clientX - rect.left, e.clientY - rect.top);
      }
      const safeIndex = typeof index === 'number' && index >= 0 ? index : null;
      requestAnimationFrame(() => setExchangeDraggingIndex(safeIndex));
    } catch (err) {
      console.error('[GameBoard] handleExchangeDragStart', err);
      setExchangeDraggingIndex(null);
      reportClientError({
        source: 'GameBoard',
        message: err?.message ?? String(err),
        stack: err?.stack,
        context: 'handleExchangeDragStart',
      });
    }
  };

  const handleExchangeDragEnd = () => {
    if (DEBUG_HAND_DRAG) console.log('[GameBoard] exchange drag END');
    setExchangeDraggingIndex(null);
  };

  const handlePlayCards = () => {
    noteTurnInteraction();
    if (selectedCards.length === 0) return;
    const myHandArr = Array.isArray(myHand) ? myHand : [];
    const allInHand = selectedCards.every((sc) => myHandArr.some((h) => cardMatches(h, sc)));
    if (!allInHand) {
      setSelectedCards([]);
      onResyncGame?.();
      return;
    }
    const hasMahJong = selectedCards.some((c) => c.name === 'mahjong');
    const isSingle = selectedCards.length === 1;
    const isFirstTrick = !game?.currentTrick?.length;
    if (hasMahJong && isSingle && isFirstTrick && !mahJongWish) {
      setShowWishInput(true);
      return;
    }
    const actionId = nextActionId();
    setClientCorrelation({ requestId: actionId, actionId });
    socket.emit('make-move', {
      requestId: actionId,
      actionId,
      cards: selectedCards,
      action: 'play',
      mahJongWish: hasMahJong && isSingle && isFirstTrick ? mahJongWish : null,
    });
    setSelectedCards([]);
    setMahJongWish('');
    setShowWishInput(false);
  };

  const handlePass = () => {
    noteTurnInteraction();
    // Cancel any scheduled auto-pass since the user (or prior scheduling) is now passing.
    if (autoPassTimerRef.current) {
      clearTimeout(autoPassTimerRef.current);
      autoPassTimerRef.current = null;
      autoPassScheduledTurnSigRef.current = null;
    }
    const actionId = nextActionId()
    setClientCorrelation({ requestId: actionId, actionId })
    socket.emit('make-move', { requestId: actionId, actionId, cards: [], action: 'pass' });
  };

  const selectedIsBomb = isBomb();
  const selectedStillInHand =
    selectedCards.length === 0 ||
    (Array.isArray(myHand) &&
      myHand.length > 0 &&
      selectedCards.every((sc) => myHand.some((h) => cardMatches(h, sc))));
  const canPlay =
    game?.state === 'playing' &&
    selectedStillInHand &&
    selectedCards.length > 0 &&
    (isMyTurn || selectedIsBomb);
  const mustPlayAfterTichu =
    !!game?.tichuDeclarations?.[playerId] && !game?.firstCardPlayed?.[playerId];
  const canPass = isMyTurn && game?.state === 'playing' && !mustPlayAfterTichu;

  // ---- Auto-pass (UI toggle) ----
  // Keep this conservative so we don't spam invalid pass actions.
  // We only auto-pass when:
  // - it's your turn
  // - you're not the lead player
  // - you don't have Dog priority
  // - the trick isn't empty (server blocks passing to start trick)
  // - Mah Jong "must play" isn't violated (conservative: block if you hold wished card)
  // - Dragon opponent selection isn't pending (server blocks other moves)
  const AUTO_PASS_DELAY_MS = 350;
  const mahJongWishRank = game?.mahJongWish?.wishedRank;
  const mahJongWishMustPlay = !!game?.mahJongWish?.mustPlay;
  const hasWishedCard =
    mahJongWishMustPlay && mahJongWishRank
      ? (Array.isArray(myHand) ? myHand : []).some(
          (c) => c?.type === 'standard' && c?.rank === mahJongWishRank
        )
      : false;

  const isLeadPlayer = game?.leadPlayer === playerId;
  const isDogPriorityPlayer = game?.dogPriorityPlayer === playerId;
  const isTrickEmpty = !Array.isArray(game?.currentTrick) || game.currentTrick.length === 0;
  const hasDragonPendingSelection = !!game?.dragonOpponentSelection;

  const canAutoPass =
    autoPassUIEnabled &&
    game?.state === 'playing' &&
    isMyTurn &&
    selectedCards.length === 0 &&
    !isLeadPlayer &&
    !isDogPriorityPlayer &&
    !isTrickEmpty &&
    !hasDragonPendingSelection &&
    !hasWishedCard &&
    !mustPlayAfterTichu &&
    !game?.hasPlayableMove;

  const autoPassTurnSig = `${game?.state ?? ''}:${game?.currentPlayerIndex ?? ''}:${game?.leadPlayer ?? ''}:${game?.dogPriorityPlayer ?? ''}:${(game?.currentTrick?.length ?? 0)}:${mahJongWishMustPlay ? mahJongWishRank : 'none'}`;

  useEffect(() => {
    // If not eligible, cancel any scheduled pass.
    if (!canAutoPass) {
      if (autoPassTimerRef.current) {
        clearTimeout(autoPassTimerRef.current);
        autoPassTimerRef.current = null;
      }
      autoPassScheduledTurnSigRef.current = null;
      return;
    }

    // Only schedule once per turn signature.
    if (autoPassScheduledTurnSigRef.current === autoPassTurnSig) return;

    // If a timer is already scheduled, clear it before scheduling a new one.
    if (autoPassTimerRef.current) {
      clearTimeout(autoPassTimerRef.current);
      autoPassTimerRef.current = null;
    }

    autoPassScheduledTurnSigRef.current = autoPassTurnSig;
    const scheduledForSig = autoPassTurnSig;

    autoPassTimerRef.current = setTimeout(() => {
      // Double-check we haven't moved to another turn / lost eligibility.
      if (autoPassScheduledTurnSigRef.current !== scheduledForSig) return;
      autoPassTimerRef.current = null;
      autoPassScheduledTurnSigRef.current = null;
      handlePass();
    }, AUTO_PASS_DELAY_MS);

    return () => {
      if (autoPassTimerRef.current) {
        clearTimeout(autoPassTimerRef.current);
        autoPassTimerRef.current = null;
      }
    };
  }, [canAutoPass, autoPassTurnSig]);

  const hintText = useMemo(() => {
    if (game?.state === 'exchanging') return ''; // exchange instruction shown in play mat center
    if (game?.state !== 'playing') return '';
    if (selectedCards.length === 0) return ''; // "Select cards to play" shown in play mat center when your turn
    if (selectedCards.length === 1) return 'Single';
    if (selectedCards.length === 2) return 'Pair';
    if (selectedCards.length === 3) return 'Triple';
    if (selectedIsBomb) return 'Bomb';
    if (selectedCards.length >= 5) return 'Combo';
    return `${selectedCards.length} cards`;
  }, [game?.state, selectedCards.length, selectedIsBomb]);

  if (!game) {
    return <div className="game-board-loading">Loading game...</div>;
  }

  // Dock sizing should also be based on measured layout width (single source of truth),
  // not raw viewport `window.innerWidth`.
  // Fallback to `window.innerWidth` only during the initial render before ResizeObserver runs.
  const dockContainerWidth =
    dockWrapperSize.w > 0
      ? dockWrapperSize.w
      : tableSize.w > 0
        ? tableSize.w
      : typeof window !== 'undefined'
        ? window.innerWidth
        : 1440;
  // Table/mat card sizing should be based on the measured center rect so the trick/won visuals
  // stay aligned to the playmat geometry (not the full viewport width).
  const tableContainerWidthBasis = centerRect?.w ?? dockContainerWidth;

  const exchangeCardSize = getExchangeCardSize(tableContainerWidthBasis);
  const wonCardSize = getWonPileCardSize(tableContainerWidthBasis);
  const tableHasSize = tableSize.w >= 10 && tableSize.h >= 10;

  const commitGrandTichu = useCallback(() => {
    if (grandTichuSubmitting || game?.cardsRevealed?.[playerId]) return;
    setGrandTichuSubmitting(true);
    setOptimisticGrandTichu(true);
    const alreadyDeclared = game?.grandTichuDeclarations?.[playerId] === true;
    if (!alreadyDeclared) {
      const actionId = nextActionId();
      setClientCorrelation({ requestId: actionId, actionId });
      socket.emit('declare-grand-tichu', { requestId: actionId, actionId });
    }
  }, [
    grandTichuSubmitting,
    game?.cardsRevealed?.[playerId],
    game?.grandTichuDeclarations?.[playerId],
    playerId,
    socket,
  ]);

  const getStateMessage = () => {
    if (!game) return '';
    const getPlayerName = (pid) => game.players?.find(p => p.id === pid)?.name ?? 'Unknown';
    switch (game.state) {
      case 'waiting': return 'Waiting for players...';
      case 'grand-tichu': return 'Grand';
      case 'exchanging': return 'Exchanging';
      case 'playing': return currentPlayer?.id === playerId ? 'Your turn' : `${getPlayerName(currentPlayer?.id)}'s turn`;
      case 'round-ending-preview': return 'Round ending...';
      case 'round-ended': return 'Round over';
      case 'finished': return `Team ${game.winner} wins`;
      default: return game.state || '';
    }
  };

  // Memoize dock action buttons so HandDock doesn't reconcile this tree on every game-update (freeze mitigation).
  const handDockChildren = useMemo(() => (
    <>
      {game.state === 'exchanging' && !game.exchangeCards?.[playerId] && !exchangeSubmitted && !game.exchangeSubmitted && (
        <button
          type="button"
          className="dock-btn dock-btn-primary"
          disabled={exchangeAssignments.some((x) => !x)}
          onClick={() => {
            if (exchangeAssignments.some((x) => !x)) return;
            const actionId = nextActionId()
            setClientCorrelation({ requestId: actionId, actionId })
            socket.emit('exchange-cards', { requestId: actionId, actionId, cards: exchangeAssignments });
            setExchangeSubmitted(true);
          }}
        >
          Exchange ({exchangeAssignments.filter(Boolean).length}/3)
        </button>
      )}
      {game.state === 'grand-tichu' && (!game.cardsRevealed?.[playerId] || game.grandTichuDeclarations?.[playerId]) && (
        <>
          {!game.cardsRevealed?.[playerId] && (
            <button
              type="button"
              className="dock-btn dock-btn-secondary dock-btn-rail"
              onClick={() => {
                const actionId = nextActionId()
                setClientCorrelation({ requestId: actionId, actionId })
                socket.emit('reveal-remaining-cards', { requestId: actionId, actionId })
              }}
            >
              Reveal cards
            </button>
          )}
          <GrandTichuHoldButton
            className={`dock-btn dock-btn-primary dock-btn-grand-hold ${(optimisticGrandTichu === true || (optimisticGrandTichu !== false && game.grandTichuDeclarations?.[playerId])) ? 'dock-btn--declared' : ''}`}
            disabled={grandTichuSubmitting || game?.cardsRevealed?.[playerId]}
            onCommit={commitGrandTichu}
          >
            Grand Tichu (+200)
          </GrandTichuHoldButton>
        </>
      )}
      {game?.state === 'playing' && isMyTurn && !game.firstCardPlayed?.[playerId] && !game.grandTichuDeclarations?.[playerId] && (
        <button
          type="button"
          className={`dock-btn dock-btn-secondary ${(optimisticTichu === true || (optimisticTichu !== false && game.tichuDeclarations?.[playerId])) ? 'dock-btn--declared' : ''}`}
          onClick={() => {
            try {
              // Emit based on server truth to avoid stale-optimistic actions.
              const serverDeclared = game?.tichuDeclarations?.[playerId] === true;
              if (!serverDeclared) {
                if (teammateCalledTichu) { setShowTichuWarning('teammate'); return; }
                if (someoneElseFinished) { setShowTichuWarning('finished'); return; }
              }
              setOptimisticTichu(!serverDeclared);
              if (serverDeclared) {
                const actionId = nextActionId()
                setClientCorrelation({ requestId: actionId, actionId })
                socket.emit('undeclare-tichu', { requestId: actionId, actionId })
              } else {
                const actionId = nextActionId()
                setClientCorrelation({ requestId: actionId, actionId })
                socket.emit('declare-tichu', { requestId: actionId, actionId })
              }
            } catch (err) {
              console.error('[GameBoard] Tichu button click', err);
              reportClientError({ source: 'GameBoard', message: err?.message ?? String(err), stack: err?.stack, context: 'Tichu button' });
            }
          }}
        >
          Tichu (+100)
        </button>
      )}
    </>
  ), [
    game?.state,
    game?.exchangeCards?.[playerId],
    game?.exchangeSubmitted,
    game?.cardsRevealed?.[playerId],
    game?.grandTichuDeclarations?.[playerId],
    grandTichuSubmitting,
    game?.firstCardPlayed?.[playerId],
    game?.tichuDeclarations?.[playerId],
    exchangeSubmitted,
    exchangeAssignments,
    optimisticGrandTichu,
    optimisticTichu,
    isMyTurn,
    playerId,
    commitGrandTichu,
    socket,
    teammateCalledTichu,
    someoneElseFinished,
  ]);

  return (
    <div
      className={`game-layout ${sidebarMode === 'overlay' ? (isSidebarOpen ? 'sidebar-overlay-open' : 'sidebar-overlay-closed') : 'sidebar-side-mode'}`}
      ref={layoutRef}
      data-theme={tableTheme === 'classic' ? undefined : tableTheme}
    >
      {sidebarMode === 'overlay' && (
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={() => setIsSidebarOpen((v) => !v)}
          aria-expanded={isSidebarOpen}
          aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {isSidebarOpen ? 'Hide panel' : 'Show panel'}
        </button>
      )}
      {geomDebug && (
        <div className="geom-debug-overlay" aria-hidden="true">
          {`viewport: w=${Math.round(viewport.w)} h=${Math.round(viewport.h)} mode=${sidebarMode} open=${isSidebarOpen}\n`}
          {`sidebar: cssW=${Math.round(sidebarW)} measuredW=${Math.round(sidebarSize.w)} dockWrapperW=${Math.round(dockWrapperSize.w)}\n`}
          {`centerRect: w=${Math.round(centerRect.w)} h=${Math.round(centerRect.h)} x=${Math.round(centerRect.x)} y=${Math.round(centerRect.y)}\n`}
          {`mat: w=${Math.round(matSize.w)} h=${Math.round(matSize.h)} x=${Math.round(matPosition.x)} y=${Math.round(matPosition.y)}\n`}
          {`seats: top=(${Math.round(seatPositions.top.x)},${Math.round(seatPositions.top.y)}) left=(${Math.round(seatPositions.left.x)},${Math.round(seatPositions.left.y)}) right=(${Math.round(seatPositions.right.x)},${Math.round(seatPositions.right.y)})\n`}
          {`exchangeCard: ${Math.round(exchangeCardSize?.w ?? 0)}x${Math.round(exchangeCardSize?.h ?? 0)} wonCard: ${Math.round(wonCardSize?.w ?? 0)}x${Math.round(wonCardSize?.h ?? 0)}\n`}
        </div>
      )}
      <div className="game-left">
        <div className="game-main">
        <div className="table-column" ref={tableRef}>
          <div className="table-surface" ref={tableSurfaceRef}>
            {/* Table header: title + current action (above top seat) */}
            <div className="table-header" style={{ height: mobileTokens.tableHeaderHeight }}>
              <h1 className="table-title">Tichu</h1>
              <div
                className={`table-current-action-box${
                  turnAlertActive
                    ? ` table-current-action-box--turn-alert${
                        turnAlertLevel > 0 ? ` table-current-action-box--turn-alert-${turnAlertLevel}` : ''
                      }`
                    : ''
                }`}
              >
                {getStateMessage()}
                {currentPlayer?.id === playerId && (game.grandTichuDeclarations?.[playerId] || game.tichuDeclarations?.[playerId]) && (
                  <span className={`table-header-declaration-pill ${game.grandTichuDeclarations?.[playerId] ? 'table-header-declaration-pill--grand' : ''}`}>
                    {game.grandTichuDeclarations?.[playerId] ? 'Grand' : 'Tichu'}
                  </span>
                )}
              </div>
            </div>
            {tableHasSize && (
            <>
            {/* Seat panels (absolute) + won-cards pile (below left/right, right of top) */}
            {['top', 'left', 'right'].map((pos) => {
              const player = opponentsByPosition[pos];
              const posObj = seatPositions[pos];
              if (!player || posObj.x < 0 || posObj.y < 0) return null;
              const stack = game.playerStacks?.[player.id];
              const stackCount = stack?.cards?.length ?? 0;
              const handCount = game.handCounts?.[player.id] ?? 0;
              const isActing = currentPlayer?.id === player.id && game.state === 'playing';
              const isDisconnected = !!player.disconnected;
              const initials = (player.name || '?').slice(0, 2).toUpperCase();

              const isExchanging = game.state === 'exchanging' && !game.exchangeCards?.[playerId];
              const exchangeSlotIndex = isExchanging ? exchangeRecipients.findIndex((r) => r.id === player.id) : -1;
              const exchangeAssignedCard = exchangeSlotIndex >= 0 ? exchangeAssignments[exchangeSlotIndex] : null;
              const exchangeLocked = exchangeSubmitted || game.exchangeSubmitted;
              const isExchangeDropTarget = exchangeSlotIndex >= 0 && !exchangeAssignedCard && !exchangeLocked;
              const isDragOverThisSeat = exchangeDragOverSlot === exchangeSlotIndex;

              const isTop = pos === 'top';
              const isTouchExchangeTarget = isTouch && isExchangeDropTarget && !!exchangePendingCard;
              const wonStackLeft = isTop
                ? posObj.x + mobileTokens.seatWidth + WON_STACK_GAP
                : posObj.x + (mobileTokens.seatWidth - wonCardSize.w) / 2;
              const wonStackTop = isTop
                ? posObj.y + (mobileTokens.seatHeight - wonCardSize.h) / 2
                : posObj.y + mobileTokens.seatHeight + WON_STACK_GAP;

              return (
                <Fragment key={`seat-${pos}-${player.id}`}>
                  <div
                    className={`seat-panel seat--${pos} seat--team-${player.team ?? 1} ${isActing ? 'seat--acting' : ''} ${isDisconnected ? 'seat--disconnected' : ''} ${isExchangeDropTarget ? 'seat--exchange-drop' : ''} ${isDragOverThisSeat ? 'seat--exchange-drag-over' : ''} ${isTouchExchangeTarget ? 'seat--exchange-touch-target' : ''}`}
                    style={{
                      left: `${posObj.x}px`,
                      top: `${posObj.y}px`,
                      width: mobileTokens.seatWidth,
                      height: mobileTokens.seatHeight,
                    }}
                    onClick={isTouchExchangeTarget ? () => {
                      handleDropOnSlot(exchangeSlotIndex, exchangePendingCard);
                      setExchangePendingCard(null);
                    } : undefined}
                    onDragOver={isExchangeDropTarget ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setExchangeDragOverSlot(exchangeSlotIndex); } : undefined}
                    onDragLeave={isExchangeDropTarget ? () => setExchangeDragOverSlot(null) : undefined}
                    onDrop={isExchangeDropTarget ? (e) => {
                      e.preventDefault();
                      setExchangeDragOverSlot(null);
                      const raw = e.dataTransfer.getData('tichu/card') || e.dataTransfer.getData('text/plain');
                      if (!raw) return;
                      try {
                        const card = JSON.parse(raw);
                        handleDropOnSlot(exchangeSlotIndex, card);
                      } catch (_) {}
                    } : undefined}
                  >
                    {(game.grandTichuDeclarations?.[player.id] || game.tichuDeclarations?.[player.id]) && (
                      <div className="seat-declaration-float">
                        <span className={`seat-declaration-pill ${game.grandTichuDeclarations?.[player.id] ? 'seat-declaration-pill--grand' : ''}`}>
                          {game.grandTichuDeclarations?.[player.id] ? 'Grand' : 'Tichu'}
                        </span>
                      </div>
                    )}
                    {isActing && (
                      <div className="seat-badges">
                        <span className="seat-acting-chip">Acting</span>
                      </div>
                    )}
                    <div className="seat-avatar">{initials}</div>
                    <div className="seat-body">
                      <div className="seat-name-row">
                        <span className="seat-name">{player.name}</span>
                      </div>
                      <span className="seat-meta">
                        <span className="seat-team-pill">Team {player.team ?? 1}</span>
                        <span className="seat-card-count">{handCount} cards</span>
                      </span>
                    </div>
                    {isExchanging && exchangeAssignedCard && (
                      <div className="seat-exchange-card" onClick={!exchangeLocked ? () => handleRemoveFromSlot(exchangeSlotIndex) : undefined} title={!exchangeLocked ? 'Click to remove' : undefined}>
                        <Card card={exchangeAssignedCard} width={exchangeCardSize.w} height={exchangeCardSize.h} compact />
                      </div>
                    )}
                    {isDisconnected && (
                      <div className="seat-disconnected-overlay" aria-live="polite">
                        <span className="seat-disconnected-label">Disconnected</span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`won-cards-pile won-cards-pile--${pos} ${stackCount === 0 ? 'won-cards-pile--empty' : ''} ${isDisconnected ? 'won-cards-pile--disconnected' : ''}`}
                    style={{
                      left: `${wonStackLeft}px`,
                      top: `${wonStackTop}px`,
                      width: wonCardSize.w,
                      minHeight: wonCardSize.h,
                    }}
                    aria-label={stackCount > 0 ? `${player.name} won ${stackCount} cards` : `${player.name} won pile (empty)`}
                  >
                    {stackCount > 0 ? (
                      <div className="won-cards-pile-card">
                        <CardBack size="stack" width={wonCardSize.w} height={wonCardSize.h} neutral />
                      </div>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}

            {/* Wished card: top-left; offset from layoutTokens so it works at any viewport size */}
            {game.mahJongWish?.wishedRank && (
              <div
                className="wished-card-panel"
                aria-live="polite"
                style={{
                  left: `${OUTER_MARGIN}px`,
                  top: `${WISHED_CARD_PANEL_TOP}px`,
                }}
              >
                <span className="wished-card-label">Wished card</span>
                <div className="wished-card-display">
                  <Card
                    card={{ type: 'standard', rank: game.mahJongWish.wishedRank, suit: 'hearts' }}
                    width={44}
                    height={62}
                    compact
                  />
                </div>
              </div>
            )}

            {/* Play mat (fills most of the center zone) */}
            <div
              className="play-mat"
              style={{
                left: `${matPosition.x}px`,
                top: `${matPosition.y}px`,
                width: `${matSize.w}px`,
                height: `${matSize.h}px`,
              }}
            >
              <div className={`play-mat-zone ${!game.currentTrick?.length ? 'empty' : ''}`}>
                {game.currentTrick?.length ? (
                  <Trick
                    trick={Array.isArray(game.currentTrick) ? game.currentTrick : []}
                    players={Array.isArray(game.players) ? game.players : []}
                    containerWidth={tableContainerWidthBasis}
                  />
                ) : game?.state === 'exchanging' && !game.exchangeCards?.[playerId] ? (
                  <span className="play-mat-empty-msg play-mat-empty-msg--instruction">
                    {isTouch ? 'Tap a card, then tap a player to assign it' : 'Drag a card to each player, or click to assign to next slot'}
                  </span>
                ) : game?.state === 'playing' && currentPlayer?.id === playerId && selectedCards.length === 0 ? (
                  <span className="play-mat-empty-msg play-mat-empty-msg--instruction">Select cards to play</span>
                ) : (
                  <span className="play-mat-empty-msg">No cards played yet</span>
                )}
              </div>
            </div>

            {/* Current player's won cards: centered above hand dock */}
            {(() => {
              const myStack = game.playerStacks?.[playerId];
              const myStackCount = myStack?.cards?.length ?? 0;
              const myWonLeft = (tableSize.w - wonCardSize.w) / 2;
              const myWonTop = tableSize.h - wonCardSize.h - WON_STACK_GAP;
              return (
                <div
                  className={`won-cards-pile won-cards-pile--mine ${myStackCount === 0 ? 'won-cards-pile--empty' : ''}`}
                  style={{
                    left: `${myWonLeft}px`,
                    top: `${myWonTop}px`,
                    width: wonCardSize.w,
                    minHeight: wonCardSize.h,
                  }}
                  aria-label={myStackCount > 0 ? `You won ${myStackCount} cards` : 'Your won pile (empty)'}
                >
                  {myStackCount > 0 ? (
                    <div className="won-cards-pile-card">
                      <CardBack size="stack" width={wonCardSize.w} height={wonCardSize.h} neutral />
                    </div>
                  ) : null}
                </div>
              );
            })()}
            </>
            )}
          </div>
        </div>
      </div>

      {/* Prompt strip: above dock (wish, exchange, dragon, etc.) */}
      {showWishInput && (
        <div className="prompt-strip">
          <p>Mah Jong wish — choose a rank</p>
          <div className="wish-rank-grid" role="group" aria-label="Wish rank">
            {['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((r) => (
              <button
                key={r}
                type="button"
                className={`wish-rank-btn ${mahJongWish === r ? 'wish-rank-btn--selected' : ''}`}
                onClick={() => setMahJongWish(mahJongWish === r ? '' : r)}
                aria-pressed={mahJongWish === r}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="prompt-actions">
            <button type="button" className="dock-btn dock-btn-primary" onClick={handlePlayCards} disabled={!mahJongWish}>
              Play with wish
            </button>
            <button type="button" className="dock-btn dock-btn-secondary" onClick={() => { setShowWishInput(false); setMahJongWish(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {game.dragonOpponentSelection?.playerId === playerId && (
        <div className="prompt-strip">
          <p>Dragon — choose who receives the trick</p>
          <div className="prompt-actions">
            {(game?.players ?? [])
              .filter((p) => p.id !== playerId && (game?.players ?? []).find((pl) => pl.id === playerId)?.team !== p.team)
              .map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  className="dock-btn dock-btn-secondary"
                  onClick={() =>
                    (() => {
                      const actionId = nextActionId()
                      setClientCorrelation({ requestId: actionId, actionId })
                      socket.emit('select-dragon-opponent', { requestId: actionId, actionId, selectedOpponentId: opp.id })
                    })()
                  }
                >
                  Give to {opp.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {showTichuWarning && (
        <div className="prompt-strip">
          <p>
            {showTichuWarning === 'teammate'
              ? 'Your teammate already called Tichu, calling it will waste the bonus.'
              : 'Someone already finished their hand — calling Tichu now will lose you points.'}
          </p>
          <div className="prompt-actions">
            <button
              type="button"
              className="dock-btn dock-btn-secondary"
              onClick={() => {
                setShowTichuWarning(null);
                setOptimisticTichu(true);
                const actionId = nextActionId();
                setClientCorrelation({ requestId: actionId, actionId });
                socket.emit('declare-tichu', { requestId: actionId, actionId });
              }}
            >
              Call Tichu anyway
            </button>
            <button
              type="button"
              className="dock-btn dock-btn-primary"
              onClick={() => setShowTichuWarning(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="hand-dock-wrapper" ref={dockWrapperRef}>
        <HandErrorBoundary onError={(err, info) => reportClientError({ source: 'HandErrorBoundary', message: err?.message ?? String(err), stack: err?.stack, componentStack: info?.componentStack })}>
        <HandDock
          cards={Array.isArray(orderedHand) ? orderedHand : []}
          selectedCards={game.state === 'exchanging' ? [] : selectedCards}
          selectionDisabled={game?.state === 'exchanging'}
          onCardClick={handleCardClick}
          playable={game.state === 'exchanging' || game.state === 'playing'}
          sortMode={sortMode}
          onSortModeChange={handleSortModeChange}
          canPlay={canPlay}
          canPass={canPass}
          onPlay={handlePlayCards}
          onPass={handlePass}
          autoPassEnabled={autoPassUIEnabled}
          onAutoPassToggle={setAutoPassUIEnabled}
          turnAlertActive={turnAlertActive}
          turnAlertLevel={turnAlertActive ? turnAlertLevel : 0}
          hintText={hintText}
          containerWidth={dockContainerWidth}
          viewportWidth={viewport.w}
          primaryLabel={selectedIsBomb ? 'Play bomb' : `Play (${selectedCards.length})`}
          showDefaultActions={game.state !== 'grand-tichu' && game.state !== 'exchanging'}
          draggable={game.state === 'exchanging' && !exchangeSubmitted && !game.exchangeSubmitted}
          onCardDragStart={game.state === 'exchanging' && !exchangeSubmitted && !game.exchangeSubmitted ? handleExchangeDragStart : undefined}
          onCardDragEnd={game.state === 'exchanging' ? handleExchangeDragEnd : undefined}
          exchangeDraggingIndex={game.state === 'exchanging' ? exchangeDraggingIndex : null}
          exchangePendingCard={game.state === 'exchanging' ? exchangePendingCard : null}
          onReorder={game.state === 'playing' ? handleHandReorder : undefined}
          exchangeReceiptLines={
            game.state === 'playing' && (!dragonPassNotice || dragonPassNoticeDismissed) && !exchangeReceiptSummaryDismissed
              ? exchangeReceiptSummaryLines
              : null
          }
          exchangeReceiptNotice={
            game.state === 'playing' && dragonPassNotice && !dragonPassNoticeDismissed
              ? dragonPassNotice.text
              : ''
          }
          onExchangeReceiptDismiss={() => {
            if (dragonPassNotice && !dragonPassNoticeDismissed) {
              setDragonPassNoticeDismissed(true);
              return;
            }
            setExchangeReceiptSummaryDismissed(true);
          }}
        >
          {handDockChildren}
        </HandDock>
        </HandErrorBoundary>
      </div>
      </div>

      <Drawer
          game={game}
          playerId={playerId}
          isConnected={isConnected}
          socket={socket}
          tableTheme={tableTheme}
          onTableThemeChange={handleTableThemeChange}
          turnAlertsEnabled={turnAlertsEnabled}
          onTurnAlertsEnabledChange={setTurnAlertsEnabled}
          onBackToLobby={onBackToLobby}
          className={sidebarMode === 'overlay' ? `sidebar-overlay ${isSidebarOpen ? 'is-open' : 'is-closed'}` : ''}
          containerRef={sidebarRef}
        />

      {exchangeFlights?.items?.length > 0 && (
        <div className="exchange-flight-overlay" aria-hidden>
          {exchangeFlights.items.map((it, i) =>
            it.card && isValidCard(it.card) ? (
              <div
                key={`${exchangeFlights.id}-${i}`}
                className="exchange-flight-card-wrap"
                style={{
                  left: `${it.fromX}px`,
                  top: `${it.fromY}px`,
                  transform: it.arrived
                    ? `translate(calc(-50% + ${it.dx}px), calc(-50% + ${it.dy}px)) scale(0.94)`
                    : 'translate(-50%, -50%) scale(1)',
                  transition: `transform ${EXCHANGE_FLIGHT_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                  transitionDelay: `${it.delay}ms`,
                }}
              >
                <Card card={it.card} width={it.w} height={it.h} compact />
              </div>
            ) : null
          )}
        </div>
      )}
      {dragonPassFlight && (
        <div className="exchange-flight-overlay" aria-hidden>
          <div
            className="exchange-flight-card-wrap dragon-pass-flight-card-wrap"
            style={{
              left: `${dragonPassFlight.fromX}px`,
              top: `${dragonPassFlight.fromY}px`,
              transform: dragonPassFlight.arrived
                ? `translate(calc(-50% + ${dragonPassFlight.dx}px), calc(-50% + ${dragonPassFlight.dy}px)) scale(0.96)`
                : 'translate(-50%, -50%) scale(1)',
              transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <CardBack size="stack" width={dragonPassFlight.w} height={dragonPassFlight.h} neutral />
          </div>
        </div>
      )}
    </div>
  );
}

export default GameBoard;
