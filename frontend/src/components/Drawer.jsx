import { useState, useRef, useEffect } from 'react';
import '../styles/drawer.css';

const TABS = ['Chat', 'Players', 'Log', 'Theme'];

const THEME_OPTIONS = [
  { value: 'classic', label: 'Classic' },
  { value: 'velvet', label: 'Velvet' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'ember', label: 'Ember' },
  { value: 'forest', label: 'Forest' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'royal', label: 'Royal' },
  { value: 'slate', label: 'Slate' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'jade', label: 'Jade' },
  { value: 'noir', label: 'Noir' },
];

function getPlayerName(players, playerId) {
  if (!players?.length) return 'Unknown';
  const p = players.find((x) => x.id === playerId);
  return p?.name ?? 'Unknown';
}

function ChatPanel({ playerId, players }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: Date.now(), text: trimmed, senderId: playerId }]);
    setMessage('');
    inputRef.current?.focus();
  };

  return (
    <div className="drawer-chat-panel">
      <div className="drawer-chat-messages" aria-label="Chat messages">
        <div className="drawer-chat-messages-inner">
          {messages.length === 0 ? (
            <p className="drawer-chat-empty">No messages yet. Say something!</p>
          ) : (
            <ul className="drawer-chat-list">
              {messages.map((m) => {
                const isOwn = m.senderId === playerId;
                const senderName = getPlayerName(players, m.senderId);
                return (
                  <li
                    key={m.id}
                    className={`drawer-chat-bubble ${isOwn ? 'drawer-chat-bubble-own' : 'drawer-chat-bubble-other'}`}
                  >
                    <span className="drawer-chat-bubble-sender">{isOwn ? 'You' : senderName}</span>
                    <span className="drawer-chat-bubble-text">{m.text}</span>
                  </li>
                );
              })}
              <li ref={messagesEndRef} aria-hidden="true" className="drawer-chat-anchor" />
            </ul>
          )}
        </div>
      </div>
      <form className="drawer-chat-input-wrap" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="drawer-chat-input"
          placeholder="Type a message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          aria-label="Chat message"
          autoComplete="off"
        />
        <button
          type="submit"
          className="drawer-chat-send"
          aria-label="Send message"
          disabled={!message.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function formatRoundScore(r) {
  const n = r ?? 0;
  return n > 0 ? `+${n}` : n;
}

/** Mock round log for visuals; backend will supply game.roundLog later. */
function getMockRoundLog(players) {
  const names = (players || []).map((p) => p.name);
  if (names.length < 4) names.push('Player 2', 'Player 3', 'Player 4');
  return [
    {
      round: 1,
      players: [
        { playerId: '1', playerName: names[0] || 'Player 1', team: 1, breakdown: [{ label: "2×5", points: 10 }, { label: "1×10", points: 10 }, { label: "3×K", points: 30 }], tichu: 100, grandTichu: null, total: 150 },
        { playerId: '2', playerName: names[1] || 'Player 2', team: 2, breakdown: [{ label: "1×10", points: 10 }, { label: "2×K", points: 20 }], tichu: -100, grandTichu: null, total: -70 },
        { playerId: '3', playerName: names[2] || 'Player 3', team: 1, breakdown: [{ label: "1×5", points: 5 }, { label: "1×Dragon", points: 25 }], tichu: null, grandTichu: null, total: 30 },
        { playerId: '4', playerName: names[3] || 'Player 4', team: 2, breakdown: [{ label: "2×10", points: 20 }, { label: "1×Phoenix", points: -25 }], tichu: null, grandTichu: -200, total: -205 },
      ],
    },
    {
      round: 2,
      players: [
        { playerId: '1', playerName: names[0] || 'Player 1', team: 1, breakdown: [{ label: "1×10", points: 10 }, { label: "2×K", points: 20 }], tichu: null, grandTichu: null, total: 30 },
        { playerId: '2', playerName: names[1] || 'Player 2', team: 2, breakdown: [{ label: "3×5", points: 15 }, { label: "1×10", points: 10 }], tichu: 100, grandTichu: null, total: 125 },
        { playerId: '3', playerName: names[2] || 'Player 3', team: 1, breakdown: [{ label: "1×Dragon", points: 25 }], tichu: null, grandTichu: 200, total: 225 },
        { playerId: '4', playerName: names[3] || 'Player 4', team: 2, breakdown: [], tichu: -100, grandTichu: null, total: -100 },
      ],
    },
  ];
}

function GameLogPanel({ game, playerId }) {
  // Use server roundLog when it's an array. Missing/empty in real games → empty state; test game with no log → mock for testing.
  const isTestGame = game?.players?.some((p) => p.isTestPlayer);
  const serverLog = game?.roundLog != null && Array.isArray(game.roundLog) ? game.roundLog : null;
  const roundLog =
    serverLog !== null ? serverLog : isTestGame ? getMockRoundLog(game?.players) : [];
  const isYou = (id) => id === playerId;

  return (
    <div className="drawer-log-panel">
      <div className="drawer-log-heading">Points per round</div>
      <div className="drawer-log-rounds">
        {roundLog.map((entry) => (
          <section key={entry.round} className="drawer-log-round" aria-label={`Round ${entry.round}`}>
            <h4 className="drawer-log-round-title">Round {entry.round}</h4>
            <ul className="drawer-log-player-list">
              {entry.players.map((p) => (
                <li key={`${entry.round}-${p.playerId}`} className={isYou(p.playerId) ? 'drawer-log-player--you' : ''}>
                  <div className="drawer-log-player-header">
                    <span className="drawer-log-player-name">{p.playerName}</span>
                    <span className="drawer-log-player-team">Team {p.team}</span>
                  </div>
                  <div className="drawer-log-player-breakdown">
                    {p.breakdown && p.breakdown.length > 0 ? (
                      p.breakdown.map((item, i) => (
                        <span key={i} className="drawer-log-breakdown-item">
                          {item.label} ({item.points}){i < p.breakdown.length - 1 ? ',' : ''}
                        </span>
                      ))
                    ) : (
                      <span className="drawer-log-breakdown-item drawer-log-breakdown-item--muted">—</span>
                    )}
                    {p.tichu != null && (
                      <span className="drawer-log-breakdown-item drawer-log-breakdown-item--tichu">
                        {p.breakdown?.length ? ', ' : ''}Tichu {p.tichu >= 0 ? `+${p.tichu}` : p.tichu}
                      </span>
                    )}
                    {p.grandTichu != null && (
                      <span className="drawer-log-breakdown-item drawer-log-breakdown-item--grand">
                        {p.breakdown?.length || p.tichu != null ? ', ' : ''}Grand {p.grandTichu >= 0 ? `+${p.grandTichu}` : p.grandTichu}
                      </span>
                    )}
                  </div>
                  <div className="drawer-log-player-total">
                    Total: <strong>{p.total >= 0 ? `+${p.total}` : p.total}</strong>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {roundLog.length === 0 && (
        <p className="drawer-log-empty">No rounds yet. Points will appear here as the game progresses.</p>
      )}
    </div>
  );
}

function Drawer({ game, playerId, isConnected, tableTheme = 'velvet', onTableThemeChange = () => {} }) {
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
          {activeTab === 'Chat' && <ChatPanel playerId={playerId} players={game?.players} />}
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
            <div className="drawer-panel-inner drawer-panel-inner--log">
              <GameLogPanel game={game} playerId={playerId} />
            </div>
          )}
          {activeTab === 'Theme' && (
            <div className="drawer-panel-inner">
              <section className="drawer-settings-section" aria-labelledby="theme-label">
                <h3 id="theme-label" className="drawer-settings-heading">Table theme</h3>
                <div className="drawer-theme-options" role="group">
                  {THEME_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`drawer-theme-btn ${tableTheme === value ? 'active' : ''}`}
                      onClick={() => onTableThemeChange(value)}
                      aria-pressed={tableTheme === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default Drawer;
