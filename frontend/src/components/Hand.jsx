import Card from './Card';
import './Hand.css';

function Hand({ cards, onCardClick, selectedCards = [], playable = false }) {
  if (!cards || cards.length === 0) {
    return <div className="hand empty">No cards</div>;
  }

  return (
    <div className="hand">
      {cards.map((card, index) => {
        const isSelected = selectedCards.some(selected => 
          selected.type === card.type &&
          (selected.type === 'standard' 
            ? selected.suit === card.suit && selected.rank === card.rank
            : selected.name === card.name)
        );
        
        return (
          <Card
            key={index}
            card={card}
            onClick={onCardClick}
            selected={isSelected}
            playable={playable}
          />
        );
      })}
    </div>
  );
}

export default Hand;
