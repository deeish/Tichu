import { useState, useRef, useEffect } from 'react';
import '../styles/drawer.css';

const TABS = ['Chat', 'Players', 'Log'];

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
