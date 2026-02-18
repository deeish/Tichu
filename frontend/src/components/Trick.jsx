import Card from './Card';
import { getTrickCardSize } from '../styles/layoutTokens';
import './Trick.css';

function Trick({ trick, players, containerWidth = 1440 }) {
  if (!trick || trick.length === 0) {
    return (
      <div className="trick empty">
        <p>No cards played yet</p>
      </div>
    );
  }

  const cardSize = getTrickCardSize(containerWidth);
  const getPlayerName = (playerId) => {
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Unknown';
  };

  return (
    <div className="trick">
      <h3>Current Trick</h3>
      <div className="trick-plays">
        {trick.map((play, index) => (
          <div key={index} className="trick-play">
            <div className="play-player">{getPlayerName(play.playerId)}</div>
            <div className="play-cards">
              {play.cards.map((card, cardIndex) => (
                <Card key={cardIndex} card={card} width={cardSize.w} height={cardSize.h} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Trick;
