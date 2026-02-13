import './CardBack.css';

/**
 * Renders a single card back.
 * size: 'small' (hand fans), 'stack' (56×80 for piles), 'normal' (80×112).
 */
function CardBack({ size = 'small' }) {
  return (
    <div className={`card-back card-back--${size}`} aria-hidden="true">
      <div className="card-back-pattern" />
    </div>
  );
}

export default CardBack;
