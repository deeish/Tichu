import './Card.css';

function Card({ card, onClick, selected = false, playable = false, width, height, draggable = false, onDragStart, onDragEnd, compact = false }) {
  if (!card) return null;

  /** When width+height set the shell shrinks but rank/suit used fixed rem without this — inner art must scale with the box. */
  const wNum = width != null ? Number(width) : NaN;
  const hNum = height != null ? Number(height) : NaN;
  const explicitW = Number.isFinite(wNum) && wNum > 0;
  const explicitH = Number.isFinite(hNum) && hNum > 0;
  const innerScalePx =
    explicitW && explicitH
      ? Math.min(hNum * 0.132, wNum * 0.265)
      : compact && explicitH
        ? hNum * 0.15
        : null;

  const sizeStyle =
    width != null || height != null
      ? {
          width: width != null ? `${width}px` : undefined,
          height: height != null ? `${height}px` : undefined,
          ...(innerScalePx != null ? { fontSize: `${innerScalePx}px` } : {}),
        }
      : undefined;

  const sizedClass = innerScalePx != null ? ' card--sized' : '';

  const handleClick = () => {
    if (onClick && playable) {
      onClick(card);
    }
  };

  const handleDragStart = (e) => {
    if (onDragStart && draggable) {
      onDragStart(e, card);
    }
  };

  const handleDragEnd = (e) => {
    if (onDragEnd && draggable) {
      onDragEnd(e);
    }
  };

  const getCardDisplay = () => {
    if (card.type === 'special') {
      return card.display || card.name;
    }
    const suitSymbols = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠'
    };
    const colors = {
      hearts: 'red',
      diamonds: 'red',
      clubs: 'black',
      spades: 'black'
    };
    const suit = card.suit && suitSymbols[card.suit] != null ? suitSymbols[card.suit] : '?';
    const color = card.suit && colors[card.suit] != null ? colors[card.suit] : 'black';
    return {
      rank: card.rank ?? '?',
      suit,
      color
    };
  };

  const display = getCardDisplay();
  const isSpecial = card.type === 'special';

  return (
    <div
      className={`card${sizedClass} ${selected ? 'selected' : ''} ${playable ? 'playable' : ''} ${isSpecial ? 'special' : ''} ${draggable ? 'card-draggable' : ''}`}
      style={sizeStyle}
      onClick={handleClick}
      draggable={draggable ? "true" : "false"}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {isSpecial ? (
        <div className="card-special">
          <div className="card-name">{display}</div>
        </div>
      ) : (
        <div className="card-standard" style={{ color: display.color }}>
          <div className="card-rank">{display.rank}</div>
          <div className="card-suit">{display.suit}</div>
        </div>
      )}
    </div>
  );
}

export default Card;
