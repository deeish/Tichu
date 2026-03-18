import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import Trick from './Trick';
import Card from './Card';
import CardBack from './CardBack';
import Drawer from './Drawer';
import HandDock from './HandDock';
import HandErrorBoundary from './HandErrorBoundary';
import { sortCardsByRank, cardKey, isValidCard } from '../utils/cardUtils';
import { DEBUG_HAND_DRAG } from '../debug';
import { reportClientError, setClientCorrelation } from '../clientErrorReport';
import {
  getDockHeight,
  getCenterRect,
  getMatSize,
  getMatPosition,
  getSeatPositions,
  getWonPileCardSize,
  getExchangeCardSize,
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
const THEMES = ['classic', 'velvet', 'midnight', 'ember', 'forest', 'ocean', 'sunset', 'royal', 'slate', 'autumn', 'jade', 'noir'];

function GameBoard({ game, socket, playerId, isConnected = true, onResyncGame }) {
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
  const [selectedCards, setSelectedCards] = useState([]);
  const [sortMode, setSortMode] = useState('none');
  const [mahJongWish, setMahJongWish] = useState('');
  const [showWishInput, setShowWishInput] = useState(false);
  const [exchangeAssignments, setExchangeAssignments] = useState([null, null, null]);
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

  const layoutRef = useRef(null);
  const tableRef = useRef(null);
  const lastTableSizeRef = useRef({ w: 0, h: 0 });
  const [tableSize, setTableSize] = useState({ w: 0, h: 0 });

  const isMyTurn = useMemo(() => {
    if (!game?.turnOrder) return false;
    const current = game.turnOrder[game.currentPlayerIndex];
    return current?.id === playerId;
  }, [game?.turnOrder, game?.currentPlayerIndex, playerId]);

  // Clear optimistic state only when server confirms undeclared (falsy). Avoid clearing on
  // every update so a stale game-update (e.g. from a bot move) doesn’t bring the glow back after unclick.
  useEffect(() => {
    if (game?.tichuDeclarations?.[playerId] == null) setOptimisticTichu(null);
  }, [game?.tichuDeclarations?.[playerId], playerId]);
  useEffect(() => {
    if (game?.grandTichuDeclarations?.[playerId] == null) setOptimisticGrandTichu(null);
  }, [game?.grandTichuDeclarations?.[playerId], playerId]);

  // Sync layout CSS vars and measure table/dock (sidebar always 320px)
  useEffect(() => {
    const root = layoutRef.current;
    if (!root) return;

    const updateDockH = () => {
      root.style.setProperty('--dock-h', `${getDockHeight()}px`);
    };

    window.addEventListener('resize', updateDockH);
    updateDockH();

    return () => window.removeEventListener('resize', updateDockH);
  }, []);

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
      setExchangeDraggingIndex(null);
      setExchangeSubmitted(false);
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

  const dockH = getDockHeight();
  const sidebarW = 320;
  const centerRect = useMemo(
    () => getCenterRect(tableSize.w, tableSize.h, dockH, sidebarW),
    [tableSize.w, tableSize.h, dockH, sidebarW]
  );
  const matSize = useMemo(
    () => getMatSize(centerRect.w, centerRect.h),
    [centerRect.w, centerRect.h]
  );
  const matPosition = useMemo(
    () => getMatPosition(centerRect, matSize.w, matSize.h),
    [centerRect, matSize.w, matSize.h, MAT_VERTICAL_BIAS, MAT_TOP_OFFSET]
  );
  const seatPositions = useMemo(
    () => getSeatPositions(tableSize.w, tableSize.h, dockH, sidebarW, matPosition, matSize),
    [tableSize.w, tableSize.h, dockH, sidebarW, matPosition, matSize]
  );

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
    setSortMode(mode);
    setHandOrderPreferenceKeys(null);
  }, []);

  const handleHandReorder = useCallback((newOrderedCards) => {
    if (!Array.isArray(newOrderedCards) || newOrderedCards.length === 0) {
      setHandOrderPreferenceKeys(null);
      return;
    }
    // Store a stable key sequence so we can remap it after plays/resyncs.
    setHandOrderPreferenceKeys(newOrderedCards.map((c) => cardKey(c)));
  }, [displayHand]);

  // When Dragon selection is pending, the dragon player is still "acting" until they choose; show their turn.
  const turnOrderCurrent = game?.turnOrder?.[game?.currentPlayerIndex];
  const currentPlayer = game?.dragonOpponentSelection
    ? (game?.turnOrder ?? []).find((p) => p.id === game.dragonOpponentSelection?.playerId) ?? turnOrderCurrent
    : turnOrderCurrent;

  const isBomb = useCallback(() => {
    if (selectedCards.length < 4) return false;
    if (selectedCards.length === 4) {
      const ranks = selectedCards.map((c) => c.rank || c.name).filter((r) => r !== 'phoenix');
      if (new Set(ranks).size === 1) return true;
    }
    if (selectedCards.length >= 5) {
      const standard = selectedCards.filter((c) => c.type === 'standard');
      if (standard.length === 0) return false;
      if (new Set(standard.map((c) => c.suit)).size === 1) return true;
    }
    return false;
  }, [selectedCards]);

  const handleCardClick = (card) => {
    try {
      if (!card || typeof card !== 'object') return;
      const validCard =
        (card.type === 'standard' && card.suit && card.rank) ||
        (card.type === 'special' && card.name);
      if (!validCard) return;

      if (game?.state === 'exchanging') {
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
  const canPass = isMyTurn && game?.state === 'playing';

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

  const containerWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const exchangeCardSize = getExchangeCardSize(containerWidth);
  const wonCardSize = getWonPileCardSize(containerWidth);
  const tableHasSize = tableSize.w >= 10 && tableSize.h >= 10;

  const getStateMessage = () => {
    if (!game) return '';
    const getPlayerName = (pid) => game.players?.find(p => p.id === pid)?.name ?? 'Unknown';
    switch (game.state) {
      case 'waiting': return 'Waiting for players...';
      case 'grand-tichu': return 'Grand';
      case 'exchanging': return 'Exchanging';
      case 'playing': return currentPlayer?.id === playerId ? 'Your turn' : `${getPlayerName(currentPlayer?.id)}'s turn`;
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
          <button
            type="button"
            className={`dock-btn dock-btn-primary ${(optimisticGrandTichu === true || (optimisticGrandTichu !== false && game.grandTichuDeclarations?.[playerId])) ? 'dock-btn--declared' : ''}`}
            onClick={() => {
              // Emit based on server truth to avoid stale-optimistic actions.
              const serverDeclared = game?.grandTichuDeclarations?.[playerId] === true;
              setOptimisticGrandTichu(!serverDeclared);
              serverDeclared
                ? (() => {
                    const actionId = nextActionId()
                    setClientCorrelation({ requestId: actionId, actionId })
                    socket.emit('undeclare-grand-tichu', { requestId: actionId, actionId })
                  })()
                : (() => {
                    const actionId = nextActionId()
                    setClientCorrelation({ requestId: actionId, actionId })
                    socket.emit('declare-grand-tichu', { requestId: actionId, actionId })
                  })();
            }}
          >
            Grand Tichu (+200)
          </button>
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
    game?.firstCardPlayed?.[playerId],
    game?.tichuDeclarations?.[playerId],
    exchangeSubmitted,
    exchangeAssignments,
    optimisticGrandTichu,
    optimisticTichu,
    isMyTurn,
    playerId,
  ]);

  return (
    <div className="game-layout" ref={layoutRef} data-theme={tableTheme === 'classic' ? undefined : tableTheme}>
      <div className="game-left">
        <div className="game-main">
        <div className="table-column" ref={tableRef}>
          <div className="table-surface">
            {/* Table header: title + current action (above top seat) */}
            <div className="table-header" style={{ height: TABLE_HEADER_HEIGHT }}>
              <h1 className="table-title">Tichu</h1>
              <div className="table-current-action-box">
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
              const wonStackLeft = isTop
                ? posObj.x + SEAT_WIDTH + WON_STACK_GAP
                : posObj.x + (SEAT_WIDTH - wonCardSize.w) / 2;
              const wonStackTop = isTop
                ? posObj.y + (SEAT_HEIGHT - wonCardSize.h) / 2
                : posObj.y + SEAT_HEIGHT + WON_STACK_GAP;

              return (
                <Fragment key={`seat-${pos}-${player.id}`}>
                  <div
                    className={`seat-panel seat--${pos} seat--team-${player.team ?? 1} ${isActing ? 'seat--acting' : ''} ${isDisconnected ? 'seat--disconnected' : ''} ${isExchangeDropTarget ? 'seat--exchange-drop' : ''} ${isDragOverThisSeat ? 'seat--exchange-drag-over' : ''}`}
                    style={{
                      left: `${posObj.x}px`,
                      top: `${posObj.y}px`,
                      width: SEAT_WIDTH,
                      height: SEAT_HEIGHT,
                    }}
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
                  <Trick trick={Array.isArray(game.currentTrick) ? game.currentTrick : []} players={Array.isArray(game.players) ? game.players : []} containerWidth={containerWidth} />
                ) : game?.state === 'exchanging' && !game.exchangeCards?.[playerId] ? (
                  <span className="play-mat-empty-msg play-mat-empty-msg--instruction">Drag a card to each player, or click to assign to next slot</span>
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

      <div className="hand-dock-wrapper">
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
          hintText={hintText}
          containerWidth={containerWidth}
          primaryLabel={selectedIsBomb ? 'Play bomb' : `Play (${selectedCards.length})`}
          showDefaultActions={game.state !== 'grand-tichu' && game.state !== 'exchanging'}
          draggable={game.state === 'exchanging' && !exchangeSubmitted && !game.exchangeSubmitted}
          onCardDragStart={game.state === 'exchanging' && !exchangeSubmitted && !game.exchangeSubmitted ? handleExchangeDragStart : undefined}
          onCardDragEnd={game.state === 'exchanging' ? handleExchangeDragEnd : undefined}
          exchangeDraggingIndex={game.state === 'exchanging' ? exchangeDraggingIndex : null}
          onReorder={game.state === 'playing' ? handleHandReorder : undefined}
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
        />
    </div>
  );
}

export default GameBoard;
