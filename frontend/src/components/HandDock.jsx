import { useRef, useState, useEffect, useMemo } from 'react';
import Card from './Card';
import CardBack from './CardBack';
import { getHandRailStep, getDockCardSize, getVisibleHandCap } from '../styles/layoutTokens';
import '../styles/handDock.css';

function HandDock({
  cards = [],
  selectedCards = [],
  onCardClick,
  playable,
  sortMode,
  onSortModeChange,
  canPlay,
  canPass,
  onPlay,
  onPass,
  hintText = '',
  hintError = false,
  primaryLabel = 'Play',
  containerWidth = 1440,
  showDefaultActions = true,
  children,
  draggable = false,
  onCardDragStart,
}) {
  const railRef = useRef(null);
  const [railW, setRailW] = useState(0);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0]?.contentRect ?? {};
      if (width != null) setRailW(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardSize = useMemo(() => getDockCardSize(containerWidth), [containerWidth]);
  const visibleCap = getVisibleHandCap(containerWidth);
  const visibleCount = Math.min(cards.length, visibleCap);
  const overflowCount = cards.length > visibleCap ? cards.length - visibleCap : 0;
  const step = getHandRailStep(railW, cardSize.w, visibleCount);
  const totalCardRowWidth = visibleCount > 0 ? (visibleCount - 1) * step + cardSize.w : 0;
  /* Card has border + margin + box-shadow; reserve space so the last card isn't clipped by overflow */
  const cardRowExtraRight = 24;
  const cardRowLeftOffset =
    railW > 0 && totalCardRowWidth > 0
      ? Math.max(0, (railW - totalCardRowWidth - cardRowExtraRight) / 2)
      : 0;

  const visibleCards = useMemo(() => cards.slice(0, visibleCount), [cards, visibleCount]);

  const isCardSelected = (card) =>
    selectedCards.some(
      (s) =>
        s.type === card.type &&
        (s.type === 'standard' ? s.suit === card.suit && s.rank === card.rank : s.name === card.name)
    );

  return (
    <div className="hand-dock">
      <div className="dock-header">
        <h2 className="dock-title">Your Hand</h2>
        <div className="dock-sort">
          {['none', 'asc', 'desc'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={sortMode === mode ? 'active' : ''}
              onClick={() => onSortModeChange(mode)}
            >
              {mode === 'none' ? 'None' : mode === 'asc' ? '↑' : '↓'}
            </button>
          ))}
        </div>
      </div>

      <div className="dock-body">
        <div className="dock-main">
          <div className="dock-won" aria-hidden="true">
            {/* Placeholder: won cards from round will go here */}
          </div>
          <div className="dock-rail" ref={railRef}>
            <div className="dock-rail-inner">
              {visibleCards.map((card, i) => {
                const isSelected = isCardSelected(card);
                const key =
                  card.type === 'standard'
                    ? `card-${card.suit}-${card.rank}-${i}`
                    : `card-${card.name}-${i}`;
                return (
                  <div
                    key={key}
                    className={`dock-card-wrap ${isSelected ? 'selected' : ''} ${!playable ? 'disabled' : ''}`}
                    style={{ left: `${cardRowLeftOffset + i * step}px` }}
                  >
                    <Card
                      card={card}
                      onClick={onCardClick}
                      selected={isSelected}
                      playable={playable}
                      width={cardSize.w}
                      height={cardSize.h}
                      draggable={draggable}
                      onDragStart={onCardDragStart ? (e) => onCardDragStart(e, card) : undefined}
                    />
                  </div>
                );
              })}
              {overflowCount > 0 && (
                <div className="dock-overflow">
                  {Array.from({ length: Math.min(overflowCount, 3) }).map((_, i) => (
                    <CardBack key={i} size="stack" />
                  ))}
                  <span className="dock-overflow-badge">+{overflowCount}</span>
                </div>
              )}
            </div>
          </div>
          <div className={`dock-hint ${hintError ? 'error' : ''}`}>
            {hintText || '\u00A0'}
          </div>
        </div>
        <div className="dock-actions-box">
          <div className="dock-actions">
            {children}
            {showDefaultActions && (
              <>
                <button
                  type="button"
                  className="dock-btn dock-btn-primary"
                  disabled={!canPlay}
                  onClick={onPlay}
                >
                  {primaryLabel}
                </button>
                <button
                  type="button"
                  className="dock-btn dock-btn-secondary"
                  disabled={!canPass}
                  onClick={onPass}
                >
                  Pass
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HandDock;
