import './CardBack.css';

/**
 * Renders a single card back.
 * size: 'small' (hand fans), 'stack' (56×80 for piles), 'normal' (80×112).
 * Optional width/height override the size dimensions.
 * neutral: use subtle gray/white pattern instead of red (e.g. for won pile).
 */
function CardBack({ size = 'small', width, height, neutral }) {
  const sizeStyle = width != null || height != null
    ? { width: width != null ? `${width}px` : undefined, height: height != null ? `${height}px` : undefined }
    : undefined;
  return (
    <div className={`card-back card-back--${size} ${neutral ? 'card-back--neutral' : ''}`} style={sizeStyle} aria-hidden="true">
      <div className="card-back-pattern" />
    </div>
  );
}

export default CardBack;
