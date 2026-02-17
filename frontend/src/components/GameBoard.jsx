import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Trick from './Trick';
import Card from './Card';
import CardBack from './CardBack';
import Drawer from './Drawer';
import HandDock from './HandDock';
import { sortCardsByRank } from '../utils/cardUtils';
import {
  getDockHeight,
  getCenterRect,
  getMatSize,
  getMatPosition,
  getSeatPositions,
  SEAT_WIDTH,
  SEAT_HEIGHT,
  STACK_MAX_BACKS,
  STACK_OFFSET,
} from '../styles/layoutTokens';
import '../styles/layout.css';
import '../styles/tableSurface.css';
import './GameBoard.css';

function GameBoard({ game, socket, playerId, isConnected = true }) {
  // ----- UI state (do not reset on game update unless invalidated) -----
  const [selectedCards, setSelectedCards] = useState([]);
  const [sortMode, setSortMode] = useState('none');
  const [mahJongWish, setMahJongWish] = useState('');
  const [showWishInput, setShowWishInput] = useState(false);
  const [exchangeAssignments, setExchangeAssignments] = useState([null, null, null]);

  const layoutRef = useRef(null);
  const tableRef = useRef(null);
  const [tableSize, setTableSize] = useState({ w: 0, h: 0 });

  const isMyTurn = useMemo(() => {
    if (!game?.turnOrder) return false;
    const current = game.turnOrder[game.currentPlayerIndex];
    return current?.id === playerId;
  }, [game?.turnOrder, game?.currentPlayerIndex, playerId]);

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
    if (game?.state !== 'exchanging') setExchangeAssignments([null, null, null]);
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
    [centerRect, matSize.w, matSize.h]
  );
  const seatPositions = useMemo(
    () => getSeatPositions(tableSize.w, tableSize.h, dockH, sidebarW),
    [tableSize.w, tableSize.h, dockH, sidebarW]
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
  const displayHand = useMemo(() => {
    if (!myHand?.length) return myHand;
    let base = myHand;
    if (game?.state === 'exchanging' && exchangeAssignments.some(Boolean)) {
      const assigned = exchangeAssignments.filter(Boolean);
      base = myHand.filter((c) => !assigned.includes(c));
    }
    try {
      if (sortMode === 'asc') return sortCardsByRank(base, true);
      if (sortMode === 'desc') return sortCardsByRank(base, false);
      return base;
    } catch {
      return base;
    }
  }, [myHand, sortMode, game?.state, exchangeAssignments]);

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
    if (game?.state !== 'playing') return '';
    if (selectedCards.length === 0) return 'Select cards to play';
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

  return (
    <div className="game-layout" ref={layoutRef}>
      <div className="game-left">
        <div className="game-main">
        <div className="table-column" ref={tableRef}>
          <div className="table-surface">
            {/* Seat panels (absolute) */}
            {['top', 'left', 'right'].map((pos) => {
              const player = opponentsByPosition[pos];
              const posObj = seatPositions[pos];
              if (!player || posObj.x < 0 || posObj.y < 0) return null;
              const stack = game.playerStacks?.[player.id];
              const stackCount = stack?.cards?.length ?? 0;
              const handCount = game.handCounts?.[player.id] ?? 0;
              const isActing = currentPlayer?.id === player.id && game.state === 'playing';
              const initials = (player.name || '?').slice(0, 2).toUpperCase();

              return (
                <div
                  key={player.id}
                  className={`seat-panel seat--${pos} ${isActing ? 'seat--acting' : ''}`}
                  style={{
                    left: `${posObj.x}px`,
                    top: `${posObj.y}px`,
                    width: SEAT_WIDTH,
                    height: SEAT_HEIGHT,
                  }}
                >
                  {isActing && <span className="seat-acting-chip">Acting</span>}
                  <div className="seat-avatar">{initials}</div>
                  <div className="seat-body">
                    <span className="seat-name">{player.name}</span>
                    <span className="seat-meta">Team {player.team} · {handCount} cards</span>
                    {handCount > 0 && (
                      <div className="seat-hand-fan">
                        {Array.from({ length: Math.min(handCount, 10) }).map((_, i) => (
                          <CardBack key={i} size="small" />
                        ))}
                        {handCount > 10 && (
                          <span className="seat-hand-more">+{handCount - 10}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {stackCount > 0 && (
                    <div className="seat-stack">
                      {Array.from({ length: Math.min(stackCount, STACK_MAX_BACKS) }).map((_, i) => (
                        <CardBack key={i} size="stack" />
                      ))}
                      {stackCount > STACK_MAX_BACKS && (
                        <span className="seat-stack-more">+{stackCount - STACK_MAX_BACKS}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Play mat (absolute, inside centerRect) */}
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
                  <Trick trick={game.currentTrick} players={game.players} />
                ) : (
                  <span className="play-mat-empty-msg">No cards played yet</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt strip: above dock (wish, exchange, dragon, etc.) */}
      {showWishInput && (
        <div className="prompt-strip">
          <p>Mah Jong wish — choose a rank</p>
          <select
            value={mahJongWish}
            onChange={(e) => setMahJongWish(e.target.value)}
            className="prompt-select"
          >
            <option value="">Select rank...</option>
            {['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
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

      {game.state === 'exchanging' && !game.exchangeCards?.[playerId] && (
        <div className="prompt-strip">
          <p>Assign 1 card to each recipient. Click a card, then it fills the next slot.</p>
          <div className="exchange-slots-inline">
            {exchangeRecipients.map((rec, i) => (
              <div key={rec.id} className="exchange-slot-inline">
                <span>To {rec.name}</span>
                {exchangeAssignments[i] ? (
                  <div className="exchange-slot-card" onClick={() => handleRemoveFromSlot(i)}>
                    <Card card={exchangeAssignments[i]} playable />
                  </div>
                ) : (
                  <span className="exchange-slot-empty">—</span>
                )}
              </div>
            ))}
          </div>
          <div className="prompt-actions">
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
          cards={displayHand}
          selectedCards={game.state === 'exchanging' ? [] : selectedCards}
          onCardClick={handleCardClick}
          playable={game.state === 'exchanging' || game.state === 'playing'}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          canPlay={canPlay}
          canPass={canPass}
          onPlay={handlePlayCards}
          onPass={handlePass}
          hintText={hintText}
          containerWidth={containerWidth}
          primaryLabel={selectedIsBomb ? 'Play bomb' : `Play (${selectedCards.length})`}
          showDefaultActions={game.state !== 'grand-tichu'}
        >
          {game.state === 'grand-tichu' && !game.cardsRevealed?.[playerId] && (
            <>
              <button type="button" className="dock-btn dock-btn-secondary dock-btn-rail" onClick={() => socket.emit('reveal-remaining-cards')}>
                Reveal cards
              </button>
              <button type="button" className="dock-btn dock-btn-primary" onClick={() => socket.emit('declare-grand-tichu')}>
                Grand Tichu (+200)
              </button>
            </>
          )}
          {game.state === 'playing' && isMyTurn && !game.firstCardPlayed?.[playerId] && (
            <button type="button" className="dock-btn dock-btn-secondary" onClick={() => socket.emit('declare-tichu')}>
              Tichu (+100)
            </button>
          )}
        </HandDock>
      </div>
      </div>

      <Drawer game={game} playerId={playerId} isConnected={isConnected} />
    </div>
  );
}

export default GameBoard;
