import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Card from './Card';
import { getWonPileCardSize } from '../styles/layoutTokens';
import './Trick.css';

function Trick({ trick, players, containerWidth = 1440 }) {
  const playsScrollRef = useRef(null);
  const userNearBottomRef = useRef(true);
  const [moreBelow, setMoreBelow] = useState(false);

  if (!trick || !Array.isArray(trick) || trick.length === 0) {
    return (
      <div className="trick empty">
        <p>No cards played yet</p>
      </div>
    );
  }

  const cardSize = getWonPileCardSize(containerWidth);
  const getPlayerName = (playerId) => {
    const player = players?.find(p => p.id === playerId);
    return player ? player.name : 'Unknown';
  };

  // Defensive: only render plays with valid shape; cap plays and cards per play to avoid DOM/layout explosion (e.g. 10-card straight)
  const MAX_PLAYS = 20;
  const MAX_CARDS_PER_PLAY = 14;
  const safePlays = trick
    .filter((play) => play && play.playerId != null && Array.isArray(play.cards) && play.cards.length > 0)
    // Keep the *latest* plays so the bottom of the trick matches the newest input.
    .slice(-MAX_PLAYS)
    .map((play) => ({
      ...play,
      cards: play.cards.slice(0, MAX_CARDS_PER_PLAY),
      _omitted: play.cards.length > MAX_CARDS_PER_PLAY ? play.cards.length - MAX_CARDS_PER_PLAY : 0
    }));

  // If all plays were invalid/empty, show single empty state (avoids grey box + "No cards" glitch after bomb/pair)
  if (safePlays.length === 0) {
    return (
      <div className="trick empty">
        <p>No cards played yet</p>
      </div>
    );
  }

  // Auto-scroll so the latest played cards stay visible.
  // Only force-scroll if the user is already near the bottom (prevents hijacking manual scroll).
  const lastPlay = safePlays[safePlays.length - 1];
  const lastCard = lastPlay?.cards?.[0] || null;
  const lastCardKey = lastCard ? `${lastCard.type || ''}-${lastCard.name || ''}-${lastCard.rank || ''}` : 'none';
  const lastPlaySignature = lastPlay
    ? `${trick.length}-${lastPlay.playerId}-${lastPlay.cards.length}-${lastPlay._omitted || 0}-${lastCardKey}`
    : `${trick.length}-none`;

  const refreshScrollMetrics = useCallback(() => {
    const el = playsScrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    userNearBottomRef.current = gap < 16;
    setMoreBelow(gap > 12 && el.scrollHeight > el.clientHeight);
  }, []);

  useEffect(() => {
    const el = playsScrollRef.current;
    if (!el) return;

    refreshScrollMetrics();
    el.addEventListener('scroll', refreshScrollMetrics, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refreshScrollMetrics()) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', refreshScrollMetrics);
      ro?.disconnect();
    };
  }, [refreshScrollMetrics]);

  // On trick update, auto-scroll if the user was previously near the bottom.
  useLayoutEffect(() => {
    const el = playsScrollRef.current;
    if (!el) return;

    if (userNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    refreshScrollMetrics();
  }, [lastPlaySignature, refreshScrollMetrics]);

  return (
    <div className="trick">
      <h3>Current Trick</h3>
      <div className="trick-plays-outer">
        <div className="trick-plays" ref={playsScrollRef}>
          {safePlays.map((play, index) => (
            <div key={`${play.playerId}-${index}`} className="trick-play">
              <div className="play-player">{getPlayerName(play.playerId)}</div>
              <div className="play-cards">
                {play.cards.map((card, cardIndex) => (
                  <Card key={cardIndex} card={card} width={cardSize.w} height={cardSize.h} />
                ))}
                {play._omitted > 0 && <span className="trick-play-omitted">+{play._omitted}</span>}
              </div>
            </div>
          ))}
        </div>
        {moreBelow ? (
          <>
            <div className="trick-plays-bottom-fade" aria-hidden />
            <span className="trick-plays-more-hint" aria-hidden="true">
              More below
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default Trick;
