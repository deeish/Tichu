import Card from './Card';
import './Hand.css';

function Hand({ cards, onCardClick, selectedCards = [], playable = false }) {
  const safeCards = Array.isArray(cards) ? cards : [];

  if (safeCards.length === 0) {
    return <div className="hand empty">No cards</div>;
  }

  return (
    <div className="hand">
      {safeCards.map((card, index) => {
        const isSelected = Array.isArray(selectedCards)
          ? selectedCards.some((selected) =>
              selected &&
              selected.type === card?.type &&
              (selected.type === 'standard'
                ? selected.suit === card.suit && selected.rank === card.rank
                : selected.name === card.name)
            )
          : false;

        return (
          <Card
            key={
              card.type === 'standard'
                ? `card-${card.suit}-${card.rank}-${index}`
                : `card-${card.name}-${index}`
            }
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
