import './GameInfo.css';

function formatRoundScore(r) {
  const n = r ?? 0;
  return n > 0 ? `+${n}` : n;
}

function GameInfo({ game, currentPlayer, playerId, variant }) {
  if (!game) return null;

  const getPlayerName = (pid) => {
    const list = Array.isArray(game.players) ? game.players : [];
    const player = list.find(p => p.id === pid);
    return player ? player.name : 'Unknown';
  };

  const getStateMessage = () => {
    switch (game.state) {
      case 'waiting':
        return 'Waiting for players...';
      case 'grand-tichu':
        return 'Grand';
      case 'exchanging':
        return 'Exchanging';
      case 'playing':
        return currentPlayer?.id === playerId ? 'Your turn' : `${getPlayerName(currentPlayer?.id)}'s turn`;
      case 'finished':
        return `Team ${game.winner} wins`;
      default:
        return game.state;
    }
  };

  if (variant === 'hud') {
    return (
      <div className="game-info game-info--hud">
        <div className="hud-center-line">{getStateMessage()}</div>
      </div>
    );
  }

  return (
    <div className="game-info">
      <div className="info-section">
        <h2>Game: {game.id}</h2>
        <p className="state-message">{getStateMessage()}</p>
      </div>

      <div className="scores-section">
        <div className="score team1">
          <span className="team-label">Team 1</span>
          <span className="score-value">{game.scores?.team1 ?? 0}</span>
          <span className="round-score">{formatRoundScore(game.roundScores?.team1)}</span>
        </div>
        <div className="score team2">
          <span className="team-label">Team 2</span>
          <span className="score-value">{game.scores?.team2 ?? 0}</span>
          <span className="round-score">{formatRoundScore(game.roundScores?.team2)}</span>
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
          <h4>Grand Declarations:</h4>
          {Object.entries(game.grandTichuDeclarations).map(([pid, declared]) => (
            declared && (
              <span key={pid} className="declaration grand">
                {getPlayerName(pid)}: Grand
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
