import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Card from './Card';
import { getHandRailStep, getDockCardSize, getVisibleHandCap } from '../styles/layoutTokens';
import { cardKey } from '../utils/cardUtils';
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
  onCardDragEnd,
  exchangeDraggingCard = null,
  onReorder,
}) {
  const railRef = useRef(null);
  const [railW, setRailW] = useState(0);
  const [reorderDrag, setReorderDrag] = useState(null);
  const dragPreviewRef = useRef(null);
  const dragPosRef = useRef({ x: 0, y: 0 });
  const dragJustEndedRef = useRef(false);

  const isExchangeDrag = draggable && onCardDragStart;
  const isReorderDrag = onReorder && !draggable;

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
  const step = getHandRailStep(railW, cardSize.w, visibleCount);
  const totalCardRowWidth = visibleCount > 0 ? (visibleCount - 1) * step + cardSize.w : 0;
  /* Card has border + margin + box-shadow; reserve space so the last card isn't clipped by overflow */
  const cardRowExtraRight = 24;
  const cardRowLeftOffset =
    railW > 0 && totalCardRowWidth > 0
      ? Math.max(0, (railW - totalCardRowWidth - cardRowExtraRight) / 2)
      : 0;

  const displayCards = useMemo(() => {
    if (!reorderDrag) return cards;
    const { startIndex, currentDropIndex } = reorderDrag;
    const list = [...cards];
    const [removed] = list.splice(startIndex, 1);
    list.splice(currentDropIndex, 0, removed);
    return list;
  }, [cards, reorderDrag]);

  const visibleCards = useMemo(() => displayCards.slice(0, visibleCount), [displayCards, visibleCount]);

  const isCardSelected = (card) =>
    selectedCards.some(
      (s) =>
        s.type === card.type &&
        (s.type === 'standard' ? s.suit === card.suit && s.rank === card.rank : s.name === card.name)
    );

  useEffect(() => {
    if (reorderDrag && dragPreviewRef.current) {
      const { x, y } = dragPosRef.current;
      dragPreviewRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, [reorderDrag]);

  const DRAG_THRESHOLD_PX = 8;

  const handleReorderPointerDown = useCallback(
    (e, card, i) => {
      if (e.button !== 0) return;
      const rail = railRef.current;
      if (!rail) return;
      const wrapEl = e.currentTarget;
      const rect = rail.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + cardRowLeftOffset + i * step);
      const offsetY = e.clientY - (rect.bottom - cardSize.h);
      const startX = e.clientX;
      const startY = e.clientY;
      let dragStarted = false;

      const onMove = (e) => {
        if (!dragStarted) {
          const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
          if (dist < DRAG_THRESHOLD_PX) return;
          dragStarted = true;
          e.preventDefault();
          if (wrapEl.setPointerCapture) wrapEl.setPointerCapture(e.pointerId);
          dragPosRef.current = { x: e.clientX - offsetX, y: e.clientY - offsetY };
          setReorderDrag({ card, startIndex: i, currentDropIndex: i, offsetX, offsetY });
        }
        if (!dragStarted) return;
        const railRect = rail.getBoundingClientRect();
        let x = e.clientX - offsetX;
        let y = e.clientY - offsetY;
        x = Math.max(railRect.left, Math.min(railRect.right - cardSize.w, x));
        y = Math.max(railRect.top, Math.min(railRect.bottom - cardSize.h, y));
        dragPosRef.current = { x, y };
        if (dragPreviewRef.current) {
          dragPreviewRef.current.style.transform = `translate(${x}px, ${y}px)`;
        }
        const rowLeft = railRect.left + cardRowLeftOffset;
        const cardLeftInRow = x - rowLeft;
        const dropIndex = Math.max(
          0,
          Math.min(visibleCount - 1, Math.round(cardLeftInRow / step))
        );
        setReorderDrag((prev) =>
          prev && prev.currentDropIndex !== dropIndex ? { ...prev, currentDropIndex: dropIndex } : prev
        );
      };

      const onUp = (e) => {
        if (!dragStarted) {
          document.removeEventListener('pointermove', onMove);
          return;
        }
        e.preventDefault();
        const railRect = rail.getBoundingClientRect();
        const rowLeft = railRect.left + cardRowLeftOffset;
        const xUp = Math.max(railRect.left, Math.min(railRect.right - cardSize.w, e.clientX - offsetX));
        const cardLeftInRowUp = xUp - rowLeft;
        const dropIndex = Math.max(
          0,
          Math.min(visibleCount - 1, Math.round(cardLeftInRowUp / step))
        );
        if (dropIndex !== i) {
          const newCards = [...cards];
          const [removed] = newCards.splice(i, 1);
          newCards.splice(dropIndex, 0, removed);
          onReorder(newCards);
          dragJustEndedRef.current = true;
          setTimeout(() => { dragJustEndedRef.current = false; }, 100);
        }
        document.removeEventListener('pointermove', onMove);
        setReorderDrag(null);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp, { once: true });
      document.addEventListener('pointercancel', onUp, { once: true });
    },
    [onReorder, cardRowLeftOffset, step, cardSize.w, cardSize.h, visibleCount, cards]
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
                // Use index in key so duplicate cards (e.g. two 7♥) get unique keys; otherwise
                // React reuses one DOM node and the other can render invisible but keep layout.
                const key = `card-${i}-${cardKey(card)}`;
                const isDraggingThis = reorderDrag && i === reorderDrag.currentDropIndex;
                const isExchangeDraggingThis = exchangeDraggingCard && cardKey(card) === cardKey(exchangeDraggingCard);
                return (
                  <div
                    key={key}
                    className={`dock-card-wrap ${isSelected ? 'selected' : ''} ${!playable ? 'disabled' : ''} ${isDraggingThis ? 'dock-card-wrap--reorder-dragging' : ''} ${isExchangeDraggingThis ? 'dock-card-wrap--exchange-dragging' : ''}`}
                    style={{
                      left: `${cardRowLeftOffset}px`,
                      transform: `translateX(${i * step}px)${isSelected ? ' translateY(-12px)' : ''}`,
                      ...(isReorderDrag ? { touchAction: 'none' } : {}),
                    }}
                    onPointerDown={isReorderDrag ? (e) => handleReorderPointerDown(e, card, i) : undefined}
                  >
                    <Card
                      card={card}
                      onClick={
                        isReorderDrag
                          ? (c) => {
                              if (dragJustEndedRef.current) return;
                              onCardClick(c);
                            }
                          : onCardClick
                      }
                      selected={isSelected}
                      playable={playable}
                      width={cardSize.w}
                      height={cardSize.h}
                      draggable={isExchangeDrag}
                      onDragStart={isExchangeDrag && onCardDragStart ? (e) => onCardDragStart(e, card) : undefined}
                      onDragEnd={isExchangeDrag && onCardDragEnd ? onCardDragEnd : undefined}
                    />
                  </div>
                );
              })}
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
      {reorderDrag &&
        createPortal(
          <div
            ref={dragPreviewRef}
            className="dock-drag-preview dock-drag-preview--reorder"
            style={{
              left: 0,
              top: 0,
              transform: `translate(${dragPosRef.current.x}px, ${dragPosRef.current.y}px)`,
            }}
            aria-hidden
          >
            <Card card={reorderDrag.card} width={cardSize.w} height={cardSize.h} draggable={false} />
          </div>,
          document.body
        )}
    </div>
  );
}

export default HandDock;
