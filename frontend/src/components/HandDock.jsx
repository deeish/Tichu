import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Card from './Card';
import { getHandRailStep, getDockCardSize, isHandTwoRow } from '../styles/layoutTokens';
import { cardKey } from '../utils/cardUtils';
import { isTouchDevice } from '../utils/touchUtils';
import { DEBUG_HAND_DRAG } from '../debug';
import { reportClientError } from '../clientErrorReport';
import '../styles/handDock.css';

/** Max cards shown in hand; Tichu max hand size is 14. */
const MAX_HAND_DISPLAY = 14;
const MIN_RAIL_STEP = 26;
const MIN_CARD_W = 28;
const MIN_CARD_H = 38;
const RAIL_SAFETY_PX = 8;

function HandDock({
  cards: cardsProp = [],
  selectedCards = [],
  selectionDisabled = false,
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
  exchangeDraggingIndex = null,
  exchangePendingCard = null,
  onReorder,
  onAutoPassToggle = () => {},
  autoPassEnabled = false,
  turnAlertActive = false,
  turnAlertLevel = 0,
  exchangeReceiptNotice = '',
  /** While playing: compact “who passed you what” (private to this client). */
  exchangeReceiptLines = null,
  onExchangeReceiptDismiss,
}) {
  const cards = Array.isArray(cardsProp) ? cardsProp.slice(0, MAX_HAND_DISPLAY) : [];
  const railRef = useRef(null);
  const lastRailWRef = useRef(0);
  const [railW, setRailW] = useState(0);
  const [reorderDrag, setReorderDrag] = useState(null);
  /** Defer hint + actions to next frame to avoid blocking the same commit as the card list (freeze mitigation). */
  const [showDockActions, setShowDockActions] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShowDockActions(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const dragPreviewRef = useRef(null);
  const dragPosRef = useRef({ x: 0, y: 0 });
  const dragJustEndedRef = useRef(false);
  /** Ref to remove pointermove listener so we can clean up on unmount if drag is in progress */
  const removePointerMoveRef = useRef(null);
  /** Always current cards so reorder commit uses latest hand (avoids stale closure if game updates during drag) */
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const isExchangeDrag = draggable && onCardDragStart;
  const isReorderDrag = onReorder && !draggable && !twoRow;

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    let rafId = null;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0]?.contentRect ?? {};
      if (width == null || typeof width !== 'number') return;
      if (Math.abs(width - lastRailWRef.current) <= 1) return;
      lastRailWRef.current = width;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setRailW(width);
      });
    });
    ro.observe(el);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const TWO_ROW_SIZE = 7;
  const ROW_GAP = 6;
  const baseCardSize = useMemo(() => getDockCardSize(containerWidth), [containerWidth]);
  const visibleCount = Math.min(Math.max(0, cards.length), MAX_HAND_DISPLAY);
  const twoRow = isHandTwoRow(containerWidth, visibleCount);
  const rowCount = twoRow ? Math.min(TWO_ROW_SIZE, visibleCount) : visibleCount;
  const cardSize = useMemo(() => {
    if (visibleCount <= 0) return baseCardSize;
    if (!Number.isFinite(railW) || railW <= 0) return baseCardSize;
    const baseStep = getHandRailStep(railW, baseCardSize.w, rowCount);
    const baseTotal = baseCardSize.w + (rowCount - 1) * baseStep;
    const maxAllowed = Math.max(0, railW - RAIL_SAFETY_PX);
    if (baseTotal <= maxAllowed) return baseCardSize;
    const fitScale = baseTotal > 0 ? maxAllowed / baseTotal : 1;
    return {
      w: Math.max(MIN_CARD_W, Math.floor(baseCardSize.w * fitScale)),
      h: Math.max(MIN_CARD_H, Math.floor(baseCardSize.h * fitScale)),
    };
  }, [baseCardSize, railW, rowCount, visibleCount]);
  const step = useMemo(() => {
    if (rowCount <= 1) return 0;
    if (!Number.isFinite(railW) || railW <= 0) return MIN_RAIL_STEP;
    const preferred = getHandRailStep(railW, cardSize.w, rowCount);
    const fitStep = Math.floor((railW - cardSize.w - RAIL_SAFETY_PX) / (rowCount - 1));
    return Math.max(0, Math.min(preferred, fitStep));
  }, [railW, cardSize.w, rowCount]);
  const totalCardRowWidth = rowCount > 0 ? (rowCount - 1) * step + cardSize.w : 0;
  /* Card has border + margin + box-shadow; reserve space so the last card isn't clipped by overflow */
  const cardRowExtraRight = railW > 0 && railW < 760 ? 8 : 24;
  const cardRowLeftOffset =
    railW > 0 && totalCardRowWidth > 0
      ? Math.max(0, (railW - totalCardRowWidth - cardRowExtraRight) / 2)
      : 0;

  const displayCards = useMemo(() => {
    if (!reorderDrag) return cards;
    const { startIndex, currentDropIndex } = reorderDrag;
    const n = cards.length;
    if (n === 0) return cards;
    const si = Math.max(0, Math.min(startIndex, n - 1));
    const di = Math.max(0, Math.min(currentDropIndex, n - 1));
    const list = [...cards];
    const [removed] = list.splice(si, 1);
    if (removed == null) return cards;
    list.splice(di, 0, removed);
    return list;
  }, [cards, reorderDrag]);

  const visibleCards = useMemo(() => displayCards.slice(0, visibleCount), [displayCards, visibleCount]);

  const isCardSelected = (card) => {
    if (selectionDisabled) return false;
    if (!card || typeof card !== 'object' || !Array.isArray(selectedCards)) return false;
    try {
      return selectedCards.some(
        (s) =>
          s && s.type === card.type &&
          (s.type === 'standard' ? s.suit === card.suit && s.rank === card.rank : s.name === card.name)
      );
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (reorderDrag && dragPreviewRef.current) {
      const { x, y } = dragPosRef.current;
      dragPreviewRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, [reorderDrag]);

  // Clear reorder drag when tab/window hidden or window loses focus (avoids stuck state when switching screen/tab)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (removePointerMoveRef.current) {
          removePointerMoveRef.current();
          removePointerMoveRef.current = null;
        }
        setReorderDrag((prev) => {
          if (prev && DEBUG_HAND_DRAG) console.log('[HandDock] visibility hidden – clearing reorder drag');
          return prev ? null : prev;
        });
      }
    };
    const onWindowBlur = () => {
      if (removePointerMoveRef.current) {
        removePointerMoveRef.current();
        removePointerMoveRef.current = null;
      }
      setReorderDrag((prev) => {
        if (prev && DEBUG_HAND_DRAG) console.log('[HandDock] window blur – clearing reorder drag');
        return prev ? null : prev;
      });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const DRAG_THRESHOLD_PX = isTouchDevice() ? 18 : 8;

  const handleReorderPointerDown = useCallback(
    (e, card, i) => {
      if (e.button !== 0) return;
      if (visibleCount <= 1) return; // No reorder with 0–1 cards; avoids division by zero (step === 0)
      const rail = railRef.current;
      if (!rail) return;
      const wrapEl = e.currentTarget;
      const rect = rail.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + cardRowLeftOffset + i * step);
      const offsetY = e.clientY - (rect.bottom - cardSize.h);
      const startX = e.clientX;
      const startY = e.clientY;
      let dragStarted = false;
      let lastMoveLogTime = 0;

      const onMove = (e) => {
        if (!dragStarted) {
          const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
          if (dist < DRAG_THRESHOLD_PX) return;
          dragStarted = true;
          e.preventDefault();
          if (wrapEl.setPointerCapture) wrapEl.setPointerCapture(e.pointerId);
          dragPosRef.current = { x: e.clientX - offsetX, y: e.clientY - offsetY };
          setReorderDrag({ card, startIndex: i, currentDropIndex: i, offsetX, offsetY });
          if (DEBUG_HAND_DRAG) console.log('[HandDock] reorder drag START', { startIndex: i, card: cardKey(card) });
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
        const dropIndex = step > 0
          ? Math.max(0, Math.min(visibleCount - 1, Math.round(cardLeftInRow / step)))
          : 0;
        if (DEBUG_HAND_DRAG && Date.now() - lastMoveLogTime > 200) {
          console.log('[HandDock] reorder onMove', { dropIndex });
          lastMoveLogTime = Date.now();
        }
        setReorderDrag((prev) =>
          prev && prev.currentDropIndex !== dropIndex ? { ...prev, currentDropIndex: dropIndex } : prev
        );
      };

      const onUp = (e) => {
        if (DEBUG_HAND_DRAG) console.log('[HandDock] reorder onUp', { eventType: e?.type, dragStarted });
        if (!dragStarted) {
          document.removeEventListener('pointermove', onMove);
          return;
        }
        e.preventDefault();
        const railRect = rail.getBoundingClientRect();
        const rowLeft = railRect.left + cardRowLeftOffset;
        const xUp = Math.max(railRect.left, Math.min(railRect.right - cardSize.w, e.clientX - offsetX));
        const cardLeftInRowUp = xUp - rowLeft;
        const dropIndex = step > 0
          ? Math.max(0, Math.min(visibleCount - 1, Math.round(cardLeftInRowUp / step)))
          : 0;
        if (dropIndex !== i) {
          const currentCards = cardsRef.current;
          if (!Array.isArray(currentCards) || currentCards.length === 0) {
            setReorderDrag(null);
            return;
          }
          const n = currentCards.length;
          const fromIdx = Math.max(0, Math.min(i, n - 1));
          const toIdx = Math.max(0, Math.min(dropIndex, n - 1));
          const newCards = [...currentCards];
          const [removed] = newCards.splice(fromIdx, 1);
          if (removed == null) {
            setReorderDrag(null);
            return;
          }
          newCards.splice(toIdx, 0, removed);
          if (DEBUG_HAND_DRAG) console.log('[HandDock] reorder COMMIT', { from: fromIdx, to: toIdx, card: cardKey(card) });
          onReorder(newCards);
          dragJustEndedRef.current = true;
          setTimeout(() => { dragJustEndedRef.current = false; }, 100);
        }
        document.removeEventListener('pointermove', onMove);
        removePointerMoveRef.current = null;
        setReorderDrag(null);
      };

      const removeMove = () => {
        document.removeEventListener('pointermove', onMove);
        removePointerMoveRef.current = null;
      };
      removePointerMoveRef.current = removeMove;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp, { once: true });
      document.addEventListener('pointercancel', onUp, { once: true });
    },
    [onReorder, cardRowLeftOffset, step, cardSize.w, cardSize.h, visibleCount]
  );

  // If component unmounts during reorder drag, remove document listener to avoid leak and setState on unmounted component
  useEffect(() => {
    return () => {
      if (removePointerMoveRef.current) {
        removePointerMoveRef.current();
        removePointerMoveRef.current = null;
      }
    };
  }, []);

  const compactDock = containerWidth < 760;

  const receiptLines = Array.isArray(exchangeReceiptLines) ? exchangeReceiptLines : [];
  const showExchangeRecap = !!exchangeReceiptNotice || receiptLines.length > 0;
  const receiptSourcesLabel = showExchangeRecap
    ? receiptLines.map((line) => line.role).join(' • ')
    : '';
  const exchangeRecapTitle = exchangeReceiptNotice
    ? exchangeReceiptNotice
    : showExchangeRecap
    ? receiptLines
        .map((line) => `${line.cardLabel} from ${line.name} (${line.role})`)
        .join('\n')
    : '';

  return (
    <div
      className={`hand-dock ${compactDock ? 'hand-dock--compact' : ''} ${
        turnAlertActive
          ? `hand-dock--turn-alert${turnAlertLevel > 0 ? ` hand-dock--turn-alert-${turnAlertLevel}` : ''}`
          : ''
      }`}
    >
      <div className="dock-header">
        <h2 className="dock-title">Your Hand</h2>
        {showExchangeRecap && (
          <div
            className="dock-exchange-recap"
            role="region"
            aria-label="Exchange: cards you received"
          >
            <span className="dock-exchange-recap-inner" title={exchangeRecapTitle}>
              {exchangeReceiptNotice ? (
                <span className="dock-exchange-recap-pill">
                  <span className="dock-exchange-recap-label">Notice:</span>
                  <span className="dock-exchange-recap-notice">{exchangeReceiptNotice}</span>
                </span>
              ) : (
                <span className="dock-exchange-recap-pill">
                  <span className="dock-exchange-recap-label">Received:</span>
                  <span className="dock-exchange-recap-chips" aria-hidden="true">
                    {receiptLines.map((line) => (
                      <span
                        key={line.key}
                        className={`dock-exchange-recap-chip ${
                          /[♥♦]/.test(line.cardLabel) ? 'dock-exchange-recap-chip--red' : ''
                        } ${line.role === 'Partner' ? 'dock-exchange-recap-chip--partner' : 'dock-exchange-recap-chip--opponent'}`}
                      >
                        {line.cardLabel}
                      </span>
                    ))}
                  </span>
                  <span className="dock-exchange-recap-sources">{receiptSourcesLabel}</span>
                </span>
              )}
            </span>
            {typeof onExchangeReceiptDismiss === 'function' && (
              <button
                type="button"
                className="dock-exchange-recap-dismiss"
                onClick={() => onExchangeReceiptDismiss()}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
        <div className="dock-sort">
          {['none', 'asc', 'desc'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={sortMode === mode ? 'active' : ''}
              onClick={() => onSortModeChange(mode)}
              title={mode === 'none' ? 'Original order' : mode === 'asc' ? 'Sort by rank (low to high)' : 'Sort by rank (high to low)'}
            >
              {mode === 'none'
                ? (containerWidth < 480 ? '—' : 'None')
                : mode === 'asc'
                  ? (containerWidth < 480 ? '↑' : 'Low→High')
                  : (containerWidth < 480 ? '↓' : 'High→Low')}
            </button>
          ))}
        </div>
      </div>

      <div className="dock-body">
        <div className="dock-main">
          <div className="dock-won" aria-hidden="true">
            {/* Placeholder: won cards from round will go here */}
          </div>
          <div className={`dock-rail${twoRow ? ' dock-rail--two-row' : ''}`} ref={railRef}>
            <div className="dock-rail-inner">
              {/* Row 1 (top row when two-row, or only row in single-row mode) */}
              {visibleCards.slice(0, rowCount).map((card, i) => {
                if (card == null) return <div key={`card-r0-placeholder-${i}`} className="dock-card-wrap" style={{ left: `${cardRowLeftOffset}px`, bottom: twoRow ? `${cardSize.h + ROW_GAP}px` : undefined, transform: `translateX(${i * step}px)`, width: cardSize.w, height: cardSize.h }} aria-hidden="true" />;
                const isSelected = isCardSelected(card);
                const key = `card-r0-${i}-${cardKey(card)}`;
                const isDraggingThis = reorderDrag && i === reorderDrag.currentDropIndex;
                const isExchangeDraggingThis = exchangeDraggingIndex === i;
                const isExchangePending = exchangePendingCard != null && cardKey(card) === cardKey(exchangePendingCard);
                return (
                  <div
                    key={key}
                    className={`dock-card-wrap ${isSelected ? 'selected' : ''} ${!playable ? 'disabled' : ''} ${isDraggingThis ? 'dock-card-wrap--reorder-dragging' : ''} ${isExchangeDraggingThis ? 'dock-card-wrap--exchange-dragging' : ''} ${isExchangePending ? 'dock-card-wrap--exchange-pending' : ''}`}
                    style={{
                      left: `${cardRowLeftOffset}px`,
                      ...(twoRow ? { bottom: `${cardSize.h + ROW_GAP}px` } : {}),
                      transform: `translateX(${i * step}px)${isSelected ? ' translateY(-12px)' : ''}`,
                      ...(isReorderDrag ? { touchAction: 'none' } : {}),
                    }}
                    onPointerDown={isReorderDrag ? (e) => handleReorderPointerDown(e, card, i) : undefined}
                  >
                    <Card
                      card={card}
                      onClick={
                        typeof onCardClick !== 'function'
                          ? undefined
                          : isReorderDrag
                            ? (c) => {
                                if (dragJustEndedRef.current) return;
                                try {
                                  onCardClick(c);
                                } catch (err) {
                                  console.error('[HandDock] onCardClick', err);
                                  reportClientError({
                                    source: 'HandDock',
                                    message: err?.message ?? String(err),
                                    stack: err?.stack,
                                    context: 'onCardClick (reorder mode)',
                                  });
                                }
                              }
                            : (c) => {
                                try {
                                  onCardClick(c);
                                } catch (err) {
                                  console.error('[HandDock] onCardClick', err);
                                  reportClientError({
                                    source: 'HandDock',
                                    message: err?.message ?? String(err),
                                    stack: err?.stack,
                                    context: 'onCardClick',
                                  });
                                }
                              }
                      }
                      selected={isSelected}
                      playable={playable}
                      width={cardSize.w}
                      height={cardSize.h}
                      compact={true}
                      draggable={isExchangeDrag}
                      onDragStart={isExchangeDrag && onCardDragStart ? (e) => onCardDragStart(e, card, i) : undefined}
                      onDragEnd={isExchangeDrag && onCardDragEnd ? onCardDragEnd : undefined}
                    />
                  </div>
                );
              })}
              {/* Row 2 (bottom row, two-row mode only) — same x layout, sits at bottom */}
              {twoRow && visibleCards.slice(rowCount).map((card, i) => {
                const absIdx = rowCount + i;
                if (card == null) return <div key={`card-r1-placeholder-${i}`} className="dock-card-wrap" style={{ left: `${cardRowLeftOffset}px`, transform: `translateX(${i * step}px)`, width: cardSize.w, height: cardSize.h }} aria-hidden="true" />;
                const isSelected = isCardSelected(card);
                const key = `card-r1-${i}-${cardKey(card)}`;
                const isExchangeDraggingThis = exchangeDraggingIndex === absIdx;
                const isExchangePending = exchangePendingCard != null && cardKey(card) === cardKey(exchangePendingCard);
                return (
                  <div
                    key={key}
                    className={`dock-card-wrap ${isSelected ? 'selected' : ''} ${!playable ? 'disabled' : ''} ${isExchangeDraggingThis ? 'dock-card-wrap--exchange-dragging' : ''} ${isExchangePending ? 'dock-card-wrap--exchange-pending' : ''}`}
                    style={{
                      left: `${cardRowLeftOffset}px`,
                      transform: `translateX(${i * step}px)${isSelected ? ' translateY(-12px)' : ''}`,
                    }}
                  >
                    <Card
                      card={card}
                      onClick={
                        typeof onCardClick !== 'function'
                          ? undefined
                          : (c) => {
                              try {
                                onCardClick(c);
                              } catch (err) {
                                console.error('[HandDock] onCardClick', err);
                                reportClientError({
                                  source: 'HandDock',
                                  message: err?.message ?? String(err),
                                  stack: err?.stack,
                                  context: 'onCardClick (row2)',
                                });
                              }
                            }
                      }
                      selected={isSelected}
                      playable={playable}
                      width={cardSize.w}
                      height={cardSize.h}
                      compact={true}
                      draggable={isExchangeDrag}
                      onDragStart={isExchangeDrag && onCardDragStart ? (e) => onCardDragStart(e, card, absIdx) : undefined}
                      onDragEnd={isExchangeDrag && onCardDragEnd ? onCardDragEnd : undefined}
                    />
                  </div>
                );
              })}
            </div>

          </div>
          {showDockActions && (
            <div className={`dock-hint ${hintError ? 'error' : ''}`}>
              {!compactDock ? (hintText || '\u00A0') : '\u00A0'}
            </div>
          )}
        </div>
        {showDockActions && (
          <div className="dock-actions-box">
            <div className="dock-actions">
              {children}
              {showDefaultActions && (
                <>
                  <button
                    type="button"
                    className={`dock-btn dock-btn-primary ${
                      turnAlertActive
                        ? `dock-btn--turn-alert${turnAlertLevel > 0 ? ` dock-btn--turn-alert-${turnAlertLevel}` : ''}`
                        : ''
                    }`}
                    disabled={!canPlay}
                    onClick={onPlay}
                  >
                    {primaryLabel}
                  </button>
                  <div className="dock-pass-row">
                    <button
                      type="button"
                      className={`dock-btn dock-btn-secondary dock-pass-btn ${
                        turnAlertActive
                          ? `dock-btn--turn-alert${turnAlertLevel > 0 ? ` dock-btn--turn-alert-${turnAlertLevel}` : ''}`
                          : ''
                      }`}
                      disabled={!canPass}
                      onClick={onPass}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className={`dock-btn dock-btn-secondary dock-auto-pass-btn ${autoPassEnabled ? 'dock-auto-pass-btn--on' : ''}`}
                      onClick={() => {
                        onAutoPassToggle?.(!autoPassEnabled);
                      }}
                      aria-pressed={autoPassEnabled}
                      title="UI-only toggle for the upcoming auto-pass feature"
                    >
                      Auto-pass: {autoPassEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {reorderDrag && createPortal(
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
            <Card card={reorderDrag.card} width={cardSize.w} height={cardSize.h} compact={true} draggable={false} />
          </div>,
          document.body
        )}
    </div>
  );
}

export default HandDock;
