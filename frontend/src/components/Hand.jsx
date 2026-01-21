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
        
        // Use card properties + index to create a unique key
        // Index ensures uniqueness even with duplicate cards (e.g., two 5 of hearts)
        // This key is stable per card instance in the array
        const cardKey = card.type === 'standard' 
          ? `card-${card.suit}-${card.rank}-${index}`
          : `card-${card.name}-${index}`;
        
        return (
          <Card
            key={cardKey}
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
