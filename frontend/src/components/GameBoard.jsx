import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import Trick from './Trick';
import Card from './Card';
import CardBack from './CardBack';
import Drawer from './Drawer';
import HandDock from './HandDock';
import { sortCardsByRank, cardKey } from '../utils/cardUtils';
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

function GameBoard({ game, socket, playerId, isConnected = true }) {
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
  const [handOrderOverride, setHandOrderOverride] = useState(null);
  // Optimistic glow for Tichu buttons so click/unclick feels instant; cleared when game state updates
  const [optimisticTichu, setOptimisticTichu] = useState(null);
  const [optimisticGrandTichu, setOptimisticGrandTichu] = useState(null);

  const layoutRef = useRef(null);
  const tableRef = useRef(null);
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
      if (width != null && height != null) setTableSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clear selection only when phase changes or selected cards no longer in hand
  const myHand = game?.hands?.[playerId] || [];
  useEffect(() => {
    if (game?.state !== 'playing' && game?.state !== 'exchanging') {
      setSelectedCards([]);
      return;
    }
    const stillInHand = (c) =>
      myHand.some(
        (h) =>
          h.type === c.type &&
          (h.type === 'standard' ? h.suit === c.suit && h.rank === c.rank : h.name === c.name)
      );
    setSelectedCards((prev) => prev.filter(stillInHand));
  }, [game?.state, myHand]);

  useEffect(() => {
    if (game?.state !== 'exchanging') {
      setExchangeAssignments([null, null, null]);
      setExchangeDraggingIndex(null);
    }
  }, [game?.state]);

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
    const order = game?.turnOrder?.length === 4 ? game.turnOrder : game?.players ?? [];
    const myIndex = order.findIndex((p) => p.id === playerId);
    if (myIndex === -1) {
      const others = (game?.players ?? []).filter((p) => p.id !== playerId);
      return { left: others[0] ?? null, top: others[1] ?? null, right: others[2] ?? null };
    }
    return {
      left: order[(myIndex + 1) % 4],
      top: order[(myIndex + 2) % 4],
      right: order[(myIndex + 3) % 4],
    };
  }, [game?.turnOrder, game?.players, playerId]);

  const exchangeRecipients = game?.exchangeRecipients ?? [];
  const cardMatches = (a, b) =>
    a && b && a.type === b.type && (a.type === 'standard' ? a.suit === b.suit && a.rank === b.rank : a.name === b.name);
  const displayHand = useMemo(() => {
    const safeHand = (myHand || []).filter(Boolean);
    if (!safeHand.length) return safeHand;
    let base = safeHand;
    if (game?.state === 'exchanging' && exchangeAssignments.some(Boolean)) {
      const assigned = exchangeAssignments.filter(Boolean);
      base = safeHand.filter((c) => !assigned.some((a) => cardMatches(a, c)));
    }
    try {
      if (sortMode === 'asc') return sortCardsByRank(base, true);
      if (sortMode === 'desc') return sortCardsByRank(base, false);
      return base;
    } catch {
      return base;
    }
  }, [myHand, sortMode, game?.state, exchangeAssignments]);

  const orderedHand = useMemo(() => {
    if (!displayHand?.length) return displayHand;
    if (!handOrderOverride?.length) return displayHand;
    const keyToCard = new Map(displayHand.map((c) => [cardKey(c), c]));
    const ordered = [];
    for (const k of handOrderOverride) {
      const c = keyToCard.get(k);
      if (c) {
        ordered.push(c);
        keyToCard.delete(k);
      }
    }
    keyToCard.forEach((c) => ordered.push(c));
    return ordered;
  }, [displayHand, handOrderOverride]);

  const handleSortModeChange = useCallback((mode) => {
    setSortMode(mode);
    setHandOrderOverride(null);
  }, []);

  const handleHandReorder = useCallback((newOrderedCards) => {
    setHandOrderOverride(newOrderedCards.map(cardKey));
  }, []);

  const currentPlayer = game?.turnOrder?.[game?.currentPlayerIndex];

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
  };

  const handleRemoveFromSlot = (i) => {
    setExchangeAssignments((prev) => {
      const n = [...prev];
      n[i] = null;
      return n;
    });
  };

  const handleDropOnSlot = (slotIndex, card) => {
    setExchangeAssignments((prev) => {
      const n = [...prev];
      n[slotIndex] = card;
      return n;
    });
    setExchangeDragOverSlot(null);
    setExchangeDraggingIndex(null);
  };

  const handleExchangeDragStart = (e, card, index) => {
    try {
      const data = JSON.stringify(card);
      e.dataTransfer.setData('tichu/card', data);
      e.dataTransfer.setData('text/plain', data);
    } catch (_) {
      e.dataTransfer.setData('text/plain', String(card?.name ?? card?.rank ?? ''));
    }
    e.dataTransfer.effectAllowed = 'move';
    const cardEl = (e.target && e.target.closest && e.target.closest('.card')) || e.target;
    if (cardEl && typeof cardEl.getBoundingClientRect === 'function') {
      const rect = cardEl.getBoundingClientRect();
      e.dataTransfer.setDragImage(cardEl, e.clientX - rect.left, e.clientY - rect.top);
    }
    // Defer so the native drag isn't interrupted by a re-render (fixes drop-on-seat in some browsers)
    requestAnimationFrame(() => setExchangeDraggingIndex(index));
  };

  const handleExchangeDragEnd = () => {
    setExchangeDraggingIndex(null);
  };

  const handlePlayCards = () => {
    if (selectedCards.length === 0) return;
    const hasMahJong = selectedCards.some((c) => c.name === 'mahjong');
    const isSingle = selectedCards.length === 1;
    const isFirstTrick = !game?.currentTrick?.length;
    if (hasMahJong && isSingle && isFirstTrick && !mahJongWish) {
      setShowWishInput(true);
      return;
    }
    socket.emit('make-move', {
      cards: selectedCards,
      action: 'play',
      mahJongWish: hasMahJong && isSingle && isFirstTrick ? mahJongWish : null,
    });
    setSelectedCards([]);
    setMahJongWish('');
    setShowWishInput(false);
  };

  const handlePass = () => {
    socket.emit('make-move', { cards: [], action: 'pass' });
  };

  const selectedIsBomb = isBomb();
  const canPlay =
    game?.state === 'playing' &&
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
            {/* Seat panels (absolute) + won-cards pile (below left/right, right of top) */}
            {['top', 'left', 'right'].map((pos) => {
              const player = opponentsByPosition[pos];
              const posObj = seatPositions[pos];
              if (!player || posObj.x < 0 || posObj.y < 0) return null;
              const stack = game.playerStacks?.[player.id];
              const stackCount = stack?.cards?.length ?? 0;
              const handCount = game.handCounts?.[player.id] ?? 0;
              const isActing = currentPlayer?.id === player.id && game.state === 'playing';
              const initials = (player.name || '?').slice(0, 2).toUpperCase();

              const isExchanging = game.state === 'exchanging' && !game.exchangeCards?.[playerId];
              const exchangeSlotIndex = isExchanging ? exchangeRecipients.findIndex((r) => r.id === player.id) : -1;
              const exchangeAssignedCard = exchangeSlotIndex >= 0 ? exchangeAssignments[exchangeSlotIndex] : null;
              const isExchangeDropTarget = exchangeSlotIndex >= 0 && !exchangeAssignedCard;
              const isDragOverThisSeat = exchangeDragOverSlot === exchangeSlotIndex;

              const isTop = pos === 'top';
              const wonStackLeft = isTop
                ? posObj.x + SEAT_WIDTH + WON_STACK_GAP
                : posObj.x + (SEAT_WIDTH - wonCardSize.w) / 2;
              const wonStackTop = isTop
                ? posObj.y + (SEAT_HEIGHT - wonCardSize.h) / 2
                : posObj.y + SEAT_HEIGHT + WON_STACK_GAP;

              return (
                <Fragment key={player.id}>
                  <div
                    className={`seat-panel seat--${pos} seat--team-${player.team ?? 1} ${isActing ? 'seat--acting' : ''} ${isExchangeDropTarget ? 'seat--exchange-drop' : ''} ${isDragOverThisSeat ? 'seat--exchange-drag-over' : ''}`}
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
                      <div className="seat-exchange-card" onClick={() => handleRemoveFromSlot(exchangeSlotIndex)} title="Click to remove">
                        <Card card={exchangeAssignedCard} width={exchangeCardSize.w} height={exchangeCardSize.h} compact />
                      </div>
                    )}
                  </div>
                  <div
                    className={`won-cards-pile won-cards-pile--${pos} ${stackCount === 0 ? 'won-cards-pile--empty' : ''}`}
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
                  <Trick trick={game.currentTrick} players={game.players} containerWidth={containerWidth} />
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
            {game.players
              .filter((p) => p.id !== playerId && game.players.find((pl) => pl.id === playerId)?.team !== p.team)
              .map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  className="dock-btn dock-btn-secondary"
                  onClick={() => socket.emit('select-dragon-opponent', opp.id)}
                >
                  Give to {opp.name}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="hand-dock-wrapper">
        <HandDock
          cards={orderedHand}
          selectedCards={game.state === 'exchanging' ? [] : selectedCards}
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
          showDefaultActions={game.state !== 'grand-tichu'}
          draggable={game.state === 'exchanging'}
          onCardDragStart={game.state === 'exchanging' ? handleExchangeDragStart : undefined}
          onCardDragEnd={game.state === 'exchanging' ? handleExchangeDragEnd : undefined}
          exchangeDraggingIndex={game.state === 'exchanging' ? exchangeDraggingIndex : null}
          onReorder={game.state === 'playing' ? handleHandReorder : undefined}
        >
          {game.state === 'exchanging' && !game.exchangeCards?.[playerId] && (
            <button
              type="button"
              className="dock-btn dock-btn-primary"
              disabled={exchangeAssignments.some((x) => !x)}
              onClick={() => {
                if (exchangeAssignments.some((x) => !x)) return;
                socket.emit('exchange-cards', exchangeAssignments);
                setExchangeAssignments([null, null, null]);
              }}
            >
              Exchange ({exchangeAssignments.filter(Boolean).length}/3)
            </button>
          )}
          {game.state === 'grand-tichu' && (!game.cardsRevealed?.[playerId] || game.grandTichuDeclarations?.[playerId]) && (
            <>
              {!game.cardsRevealed?.[playerId] && (
                <button type="button" className="dock-btn dock-btn-secondary dock-btn-rail" onClick={() => socket.emit('reveal-remaining-cards')}>
                  Reveal cards
                </button>
              )}
              <button
                type="button"
                className={`dock-btn dock-btn-primary ${(optimisticGrandTichu === true || (optimisticGrandTichu !== false && game.grandTichuDeclarations?.[playerId])) ? 'dock-btn--declared' : ''}`}
                onClick={() => {
                  const declared = optimisticGrandTichu === true || (optimisticGrandTichu !== false && game.grandTichuDeclarations?.[playerId]);
                  setOptimisticGrandTichu(!declared);
                  declared ? socket.emit('undeclare-grand-tichu') : socket.emit('declare-grand-tichu');
                }}
              >
                Grand Tichu (+200)
              </button>
            </>
          )}
          {game.state === 'playing' && isMyTurn && !game.firstCardPlayed?.[playerId] && (
            <button
              type="button"
              className={`dock-btn dock-btn-secondary ${(optimisticTichu === true || (optimisticTichu !== false && game.tichuDeclarations?.[playerId])) ? 'dock-btn--declared' : ''}`}
              onClick={() => {
                const declared = optimisticTichu === true || (optimisticTichu !== false && game.tichuDeclarations?.[playerId]);
                setOptimisticTichu(!declared);
                declared ? socket.emit('undeclare-tichu') : socket.emit('declare-tichu');
              }}
            >
              Tichu (+100)
            </button>
          )}
        </HandDock>
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
