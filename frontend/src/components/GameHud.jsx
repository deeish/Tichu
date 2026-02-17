import GameInfo from './GameInfo';
import '../styles/hud.css';

function GameHud({ game, currentPlayer, playerId, isConnected }) {
  return (
    <header className="game-hud" role="banner">
      <div className="hud-inner">
        {/* Top left: status + party code (game id) */}
        <div className="hud-left">
          <span className={`hud-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {game?.id && <span className="hud-party-code">{game.id}</span>}
        </div>
        {/* Top middle: title with game info under it */}
        <div className="hud-center">
          <span className="hud-title">Tichu</span>
          {game && (
            <GameInfo game={game} currentPlayer={currentPlayer} playerId={playerId} variant="hud" />
          )}
        </div>
      </div>
    </header>
  );
}

export default GameHud;
