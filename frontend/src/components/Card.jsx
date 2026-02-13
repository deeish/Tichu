import './Card.css';

function Card({ card, onClick, selected = false, playable = false, width, height }) {
  if (!card) return null;

  const sizeStyle = (width != null || height != null)
    ? { width: width != null ? `${width}px` : undefined, height: height != null ? `${height}px` : undefined }
    : undefined;

  const handleClick = () => {
    if (onClick && playable) {
      onClick(card);
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
    return {
      rank: card.rank,
      suit: suitSymbols[card.suit],
      color: colors[card.suit]
    };
  };

  const display = getCardDisplay();
  const isSpecial = card.type === 'special';

  return (
    <div
      className={`card ${selected ? 'selected' : ''} ${playable ? 'playable' : ''} ${isSpecial ? 'special' : ''}`}
      style={sizeStyle}
      onClick={handleClick}
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
