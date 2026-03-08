import Card from './Card';
import { getWonPileCardSize } from '../styles/layoutTokens';
import './Trick.css';

function Trick({ trick, players, containerWidth = 1440 }) {
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
    .slice(0, MAX_PLAYS)
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

  return (
    <div className="trick">
      <h3>Current Trick</h3>
      <div className="trick-plays">
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
    </div>
  );
}

export default Trick;
