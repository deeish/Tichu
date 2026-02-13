import GameInfo from './GameInfo';
import '../styles/hud.css';

function GameHud({ game, currentPlayer, playerId, isConnected }) {
  return (
    <header className="game-hud" role="banner">
      <div className="hud-inner">
        <div className="hud-brand">
          <span className="hud-title">Tichu</span>
          <span className={`hud-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {game && (
          <GameInfo game={game} currentPlayer={currentPlayer} playerId={playerId} variant="hud" />
        )}
      </div>
    </header>
  );
}

export default GameHud;
