import { useState } from 'react';
import '../styles/drawer.css';

const TABS = ['Chat', 'Players', 'Log'];

function formatRoundScore(r) {
  const n = r ?? 0;
  return n > 0 ? `+${n}` : n;
}

function Drawer({ game, playerId, isConnected }) {
  const [activeTab, setActiveTab] = useState('Chat');

  return (
    <aside className="sidebar-column">
      <div className="drawer-content">
        {/* Status + party code (moved from removed HUD bar) */}
        <div className="sidebar-top-meta">
          <span className={`sidebar-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {game?.id && <span className="sidebar-party-code">{game.id}</span>}
        </div>

        {/* Team scores */}
        {game?.scores != null && (
          <div className="sidebar-scores">
            <div className="sidebar-score-chip">
              <span className="sidebar-score-value">{game.scores.team1 ?? 0}</span>
              <span className="sidebar-score-label">Team 1 {formatRoundScore(game.roundScores?.team1)}</span>
            </div>
            <div className="sidebar-score-chip">
              <span className="sidebar-score-value">{game.scores.team2 ?? 0}</span>
              <span className="sidebar-score-label">Team 2 {formatRoundScore(game.roundScores?.team2)}</span>
            </div>
          </div>
        )}

        <div className="drawer-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`drawer-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="drawer-panel">
          {activeTab === 'Chat' && (
            <div className="drawer-panel-inner">
              <p className="drawer-placeholder">Chat will appear here.</p>
            </div>
          )}
          {activeTab === 'Players' && game?.players && (
            <div className="drawer-panel-inner">
              <ul className="drawer-players">
                {game.players.map((p) => (
                  <li key={p.id} className={p.id === playerId ? 'you' : ''}>
                    <span className="drawer-player-name">{p.name}</span>
                    <span className="drawer-player-team">Team {p.team}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activeTab === 'Log' && (
            <div className="drawer-panel-inner">
              <p className="drawer-placeholder">Game log will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default Drawer;
