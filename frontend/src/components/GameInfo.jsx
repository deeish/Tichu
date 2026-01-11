import './GameInfo.css';

function GameInfo({ game, currentPlayer, playerId }) {
  if (!game) return null;

  const getPlayerName = (playerId) => {
    const player = game.players.find(p => p.id === playerId);
    return player ? player.name : 'Unknown';
  };

  const getStateMessage = () => {
    switch (game.state) {
      case 'waiting':
        return 'Waiting for players...';
      case 'grand-tichu':
        return 'Declare Grand Tichu (optional)';
      case 'exchanging':
        return 'Exchange cards with other players';
      case 'playing':
        return currentPlayer?.id === playerId 
          ? 'Your turn!' 
          : `${getPlayerName(currentPlayer?.id)}'s turn`;
      case 'finished':
        return `Game Over! Team ${game.winner} wins!`;
      default:
        return game.state;
    }
  };

  return (
    <div className="game-info">
      <div className="info-section">
        <h2>Game: {game.id}</h2>
        <p className="state-message">{getStateMessage()}</p>
      </div>

      <div className="scores-section">
        <div className="score team1">
          <span className="team-label">Team 1</span>
          <span className="score-value">{game.scores?.team1 || 0}</span>
          <span className="round-score">+{game.roundScores?.team1 || 0}</span>
        </div>
        <div className="score team2">
          <span className="team-label">Team 2</span>
          <span className="score-value">{game.scores?.team2 || 0}</span>
          <span className="round-score">+{game.roundScores?.team2 || 0}</span>
        </div>
      </div>

      {game.tichuDeclarations && Object.keys(game.tichuDeclarations).length > 0 && (
        <div className="declarations">
          <h4>Tichu Declarations:</h4>
          {Object.entries(game.tichuDeclarations).map(([pid, declared]) => (
            declared && (
              <span key={pid} className="declaration">
                {getPlayerName(pid)}: Tichu
              </span>
            )
          ))}
        </div>
      )}

      {game.grandTichuDeclarations && Object.keys(game.grandTichuDeclarations).length > 0 && (
        <div className="declarations">
          <h4>Grand Tichu Declarations:</h4>
          {Object.entries(game.grandTichuDeclarations).map(([pid, declared]) => (
            declared && (
              <span key={pid} className="declaration grand">
                {getPlayerName(pid)}: Grand Tichu
              </span>
            )
          ))}
        </div>
      )}

      {game.mahJongWish && (
        <div className="wish-info">
          <h4>Mah Jong Wish:</h4>
          <span className="wish-display">
            {getPlayerName(game.leadPlayer)} wished for: <strong>{game.mahJongWish.wishedRank}</strong>
            {game.mahJongWish.mustPlay && ' (must be played)'}
          </span>
        </div>
      )}
    </div>
  );
}

export default GameInfo;
