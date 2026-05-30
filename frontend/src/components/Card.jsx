import './Card.css';

function Card({ card, onClick, selected = false, playable = false, width, height, draggable = false, onDragStart, onDragEnd, compact = false }) {
  if (!card) return null;

  const sizeStyle =
    width != null || height != null
      ? {
          width: width != null ? `${width}px` : undefined,
          height: height != null ? `${height}px` : undefined,
          ...(compact && height != null ? { fontSize: `${height * 0.18}px` } : {}),
        }
      : undefined;

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

  const SPECIAL_ABBREV = { 'Mah Jong': 'MJ', 'Phoenix': 'Ph', 'Dragon': 'Dr', 'Dog': 'Dog' };

  const getCardDisplay = () => {
    if (card.type === 'special') {
      const fullName = card.display || card.name;
      if (compact && width != null && width <= 40) {
        return SPECIAL_ABBREV[fullName] ?? fullName;
      }
      return fullName;
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

  // Always calculate font-size for special cards so the full name fits on one
  // line at any card size. Skip only when abbreviations are shown (compact + width ≤ 40).
  // Sets padding inline too so CSS specificity can't override it back to 0.5em.
  const specialFontStyle = isSpecial && !(compact && width != null && width <= 40)
    ? (() => {
        // Best-guess card content width: use explicit width, else estimate from height,
        // else fall back to default 80px card.
        const cardW = width != null ? width : height != null ? Math.round(height * 0.714) : 80;
        const contentW = cardW - 4;   // subtract 2px border each side (border-box)
        const paddingH = 3;           // horizontal padding each side (px)
        const available = contentW - paddingH * 2;
        const fitted = available / (display.length * 0.75);
        return {
          fontSize: `${Math.min(12.5, Math.max(7, fitted))}px`,
          padding: `4px ${paddingH}px`,
        };
      })()
    : null;

  return (
    <div
      className={`card ${selected ? 'selected' : ''} ${playable ? 'playable' : ''} ${isSpecial ? 'special' : ''} ${draggable ? 'card-draggable' : ''}`}
      style={sizeStyle}
      onClick={handleClick}
      draggable={draggable ? "true" : "false"}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {isSpecial ? (
        <div className="card-special" style={specialFontStyle}>
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
