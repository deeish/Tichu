import { useState } from 'react';
import '../styles/drawer.css';

const TABS = ['Log', 'Chat', 'Players'];

function Drawer({ open, onToggle, game, playerId }) {
  const [activeTab, setActiveTab] = useState('Players');

  return (
    <aside className={`drawer-column ${open ? 'drawer-open' : ''}`}>
      <div className="drawer">
        <button
          type="button"
          className="drawer-toggle"
          onClick={onToggle}
          aria-label={open ? 'Collapse drawer' : 'Open drawer'}
        >
          <span className="drawer-grip" aria-hidden />
        </button>
        <div className="drawer-content">
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
            {activeTab === 'Log' && (
              <div className="drawer-panel-inner">
                <p className="drawer-placeholder">Game log will appear here.</p>
              </div>
            )}
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
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Drawer;
