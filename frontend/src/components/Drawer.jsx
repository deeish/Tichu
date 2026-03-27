import { useState, useRef, useEffect } from 'react';
import '../styles/drawer.css';
import { setClientCorrelation } from '../clientErrorReport';

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

function ChatPanel({ playerId, players, socket, game }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lastGameIdRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // New match: different game id → fresh chat (lobby → game or switch party).
  useEffect(() => {
    const gid = game?.id ?? null;
    if (gid != null && lastGameIdRef.current != null && gid !== lastGameIdRef.current) {
      setMessages([]);
    }
    if (gid != null) lastGameIdRef.current = gid;
    else if (game == null) lastGameIdRef.current = null;
  }, [game?.id, game]);

  // Room rule: keep history for the whole game; clear when the game is finished.
  useEffect(() => {
    if (game?.state === 'finished') {
      setMessages([]);
    }
  }, [game?.state]);

  useEffect(() => {
    if (!socket) return;
    const onChat = (data) => {
      setMessages((prev) => [...prev, { id: data.id ?? `${data.senderId}-${Date.now()}`, text: data.text, senderId: data.senderId, senderName: data.senderName }]);
    };
    socket.on('chat-message', onChat);
    return () => socket.off('chat-message', onChat);
  }, [socket]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || !socket) return;
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setClientCorrelation({ requestId });
    socket.emit('chat-message', { text: trimmed, requestId });
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
                const senderName = m.senderName ?? getPlayerName(players, m.senderId);
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

function sumRoundTeamTotals(players, team) {
  if (!Array.isArray(players)) return 0;
  const t = Number(team);
  return players.reduce((sum, p) => {
    if (Number(p.team) !== t) return sum;
    const n = Number(p.total);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Human-readable signed points (+50, -20, 0). */
function formatSignedPoints(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v > 0) return `+${v}`;
  return String(v);
}

/** Mock round log for visuals; backend will supply game.roundLog when rounds complete. Includes a double-victory round so quick test game Log tab can be verified. */
function getMockRoundLog(players) {
  const names = (players || []).map((p) => p.name);
  if (names.length < 4) names.push('Player 2', 'Player 3', 'Player 4');
  return [
    {
      round: 1,
      doubleVictory: true,
      players: [
        { playerId: '1', playerName: names[0] || 'Player 1', team: 1, placement: 1, breakdown: [], tichu: 100, grandTichu: null, total: 200 },
        { playerId: '2', playerName: names[1] || 'Player 2', team: 1, placement: 2, breakdown: [], tichu: null, grandTichu: 200, total: 200 },
        { playerId: '3', playerName: names[2] || 'Player 3', team: 2, placement: 3, breakdown: [], tichu: null, grandTichu: null, total: 0 },
        { playerId: '4', playerName: names[3] || 'Player 4', team: 2, placement: 4, breakdown: [], tichu: -100, grandTichu: null, total: -100 },
      ],
    },
    {
      round: 2,
      players: [
        { playerId: '1', playerName: names[0] || 'Player 1', team: 1, placement: 1, breakdown: [{ label: "2×5", points: 10 }, { label: "1×10", points: 10 }, { label: "3×K", points: 30 }], tichu: 100, grandTichu: null, total: 150 },
        { playerId: '2', playerName: names[1] || 'Player 2', team: 2, placement: 2, breakdown: [{ label: "1×10", points: 10 }, { label: "2×K", points: 20 }], tichu: -100, grandTichu: null, total: -70 },
        { playerId: '3', playerName: names[2] || 'Player 3', team: 1, placement: 3, breakdown: [{ label: "1×5", points: 5 }, { label: "1×Dragon", points: 25 }], tichu: null, grandTichu: null, total: 30 },
        { playerId: '4', playerName: names[3] || 'Player 4', team: 2, placement: 4, breakdown: [{ label: "2×10", points: 20 }, { label: "1×Phoenix", points: -25 }], tichu: null, grandTichu: -200, total: -205 },
      ],
    },
    {
      round: 3,
      doubleVictory: true,
      players: [
        { playerId: '1', playerName: names[0] || 'Player 1', team: 1, placement: 1, breakdown: [], tichu: 100, grandTichu: null, total: 200 },
        { playerId: '2', playerName: names[1] || 'Player 2', team: 1, placement: 2, breakdown: [], tichu: null, grandTichu: 200, total: 200 },
        { playerId: '3', playerName: names[2] || 'Player 3', team: 2, placement: 3, breakdown: [], tichu: null, grandTichu: null, total: 0 },
        { playerId: '4', playerName: names[3] || 'Player 4', team: 2, placement: 4, breakdown: [], tichu: -100, grandTichu: null, total: -100 },
      ],
    },
  ];
}

function GameLogPanel({ game, playerId }) {
  // Use server roundLog when it's an array with entries. Empty in real games → empty state. Test game with no rounds yet → mock so Log tab shows sample (including double-victory row) for verification.
  const isTestGame = game?.players?.some((p) => p.isTestPlayer);
  const serverLog = game?.roundLog != null && Array.isArray(game.roundLog) ? game.roundLog : null;
  const hasServerRounds = serverLog !== null && serverLog.length > 0;
  const roundLog =
    hasServerRounds ? serverLog : isTestGame ? getMockRoundLog(game?.players) : [];
  const isYou = (id) => id === playerId;

  let runningTeam1 = 0;
  let runningTeam2 = 0;
  const roundsWithStandings = roundLog.map((entry) => {
    const roundPlayers = Array.isArray(entry.players) ? entry.players : [];
    const delta1 = sumRoundTeamTotals(roundPlayers, 1);
    const delta2 = sumRoundTeamTotals(roundPlayers, 2);
    runningTeam1 += delta1;
    runningTeam2 += delta2;
    return {
      entry,
      roundPlayers,
      cumulative1: runningTeam1,
      cumulative2: runningTeam2,
      delta1,
      delta2,
    };
  });

  return (
    <div className="drawer-log-panel">
      <div className="drawer-log-heading">Round log</div>
      <div className="drawer-log-rounds">
        {roundsWithStandings.map(
          ({ entry, roundPlayers, cumulative1, cumulative2, delta1, delta2 }) => (
            <section key={entry.round} className="drawer-log-round" aria-label={`Round ${entry.round}`}>
              <h4 className="drawer-log-round-title">
                <span className="drawer-log-round-title-accent" aria-hidden />
                Round {entry.round}
              </h4>
              <ul className="drawer-log-player-list">
                {roundPlayers.map((p) => (
                  <li key={`${entry.round}-${p.playerId}`} className={isYou(p.playerId) ? 'drawer-log-player--you' : ''}>
                    <div className="drawer-log-player-top">
                      <div className="drawer-log-player-ident">
                        <span className="drawer-log-player-name">{p.playerName}</span>
                        <span className={`drawer-log-team-pill drawer-log-team-pill--t${p.team}`}>Team {p.team}</span>
                      </div>
                      <span className="drawer-log-player-score" title="Points this round">
                        {formatSignedPoints(p.total)}
                      </span>
                    </div>
                    <div className="drawer-log-player-breakdown">
                      {entry.doubleVictory && (p.placement === 1 || p.placement === 2) ? (
                        <span className="drawer-log-breakdown-item drawer-log-breakdown-item--placement">
                          {p.placement === 1 ? '1st' : '2nd'}
                        </span>
                      ) : entry.doubleVictory && (p.placement === 3 || p.placement === 4) ? (
                        <span className="drawer-log-breakdown-item drawer-log-breakdown-item--placement">
                          {p.placement === 3 ? '3rd' : '4th'}
                        </span>
                      ) : p.breakdown && p.breakdown.length > 0 ? (
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
                          {(entry.doubleVictory && (p.placement === 1 || p.placement === 2)) || (entry.doubleVictory && (p.placement === 3 || p.placement === 4)) || (p.breakdown?.length) ? ', ' : ''}Tichu {p.tichu >= 0 ? `+${p.tichu}` : p.tichu}
                        </span>
                      )}
                      {p.grandTichu != null && (
                        <span className="drawer-log-breakdown-item drawer-log-breakdown-item--grand">
                          {(entry.doubleVictory && (p.placement === 1 || p.placement === 2)) || (entry.doubleVictory && (p.placement === 3 || p.placement === 4)) || p.breakdown?.length || p.tichu != null ? ', ' : ''}Grand {p.grandTichu >= 0 ? `+${p.grandTichu}` : p.grandTichu}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="drawer-log-standings" aria-label={`Standings after round ${entry.round}`}>
                <div className="drawer-log-standings-caption">After this round</div>
                <div className="drawer-log-standings-chips">
                  <div className="drawer-log-standings-chip drawer-log-standings-chip--t1">
                    <span className="drawer-log-standings-chip-label">Team 1</span>
                    <span className="drawer-log-standings-chip-value">{formatSignedPoints(cumulative1)}</span>
                    {delta1 !== 0 && (
                      <span className="drawer-log-standings-chip-round">{formatSignedPoints(delta1)} this round</span>
                    )}
                  </div>
                  <div className="drawer-log-standings-chip drawer-log-standings-chip--t2">
                    <span className="drawer-log-standings-chip-label">Team 2</span>
                    <span className="drawer-log-standings-chip-value">{formatSignedPoints(cumulative2)}</span>
                    {delta2 !== 0 && (
                      <span className="drawer-log-standings-chip-round">{formatSignedPoints(delta2)} this round</span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )
        )}
      </div>
      {roundLog.length === 0 && (
        <p className="drawer-log-empty">No rounds yet. Points will appear here as the game progresses.</p>
      )}
    </div>
  );
}

function Drawer({
  game,
  playerId,
  isConnected,
  socket,
  tableTheme = 'velvet',
  onTableThemeChange = () => {},
  onBackToLobby = null,
  className = '',
  containerRef = null,
}) {
  const [activeTab, setActiveTab] = useState('Chat');

  const handleBackToLobbyClick = () => {
    if (!onBackToLobby) return;
    const st = game?.state;
    const midRound =
      st === 'playing' ||
      st === 'exchanging' ||
      st === 'grand-tichu' ||
      st === 'round-ended';
    const msg = midRound
      ? 'Leave this game? Your seat will open.'
      : 'Leave this party?';
    if (!window.confirm(msg)) return;
    onBackToLobby();
  };

  const showBackToLobby = typeof onBackToLobby === 'function' && game?.state !== 'finished';

  return (
    <aside className={`sidebar-column ${className}`.trim()} ref={containerRef}>
      <div className="drawer-content">
        {/* Status + party code + leave (session controls) */}
        <div className="sidebar-top-meta">
          <div className="sidebar-top-meta-left">
            <span className={`sidebar-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {game?.id && <span className="sidebar-party-code">{game.id}</span>}
          </div>
          {showBackToLobby && (
            <button type="button" className="drawer-back-to-lobby" onClick={handleBackToLobbyClick}>
              Back to lobby
            </button>
          )}
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

        <div className="drawer-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab}
              id={`drawer-tab-${tab.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`drawer-panel-${tab.toLowerCase()}`}
              className={`drawer-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="drawer-panel">
          <div
            className={`drawer-tab-panel ${activeTab === 'Chat' ? 'drawer-tab-panel--active' : ''}`}
            role="tabpanel"
            id="drawer-panel-chat"
            aria-labelledby="drawer-tab-chat"
          >
            <ChatPanel playerId={playerId} players={game?.players} socket={socket} game={game} />
          </div>
          <div
            className={`drawer-tab-panel ${activeTab === 'Players' ? 'drawer-tab-panel--active' : ''}`}
            role="tabpanel"
            id="drawer-panel-players"
            aria-labelledby="drawer-tab-players"
          >
            {(game?.players ?? []).length > 0 ? (
              <div className="drawer-panel-inner">
                <ul className="drawer-players">
                  {(game?.players ?? []).map((p) => (
                    <li key={p.id} className={p.id === playerId ? 'you' : ''}>
                      <span className="drawer-player-name">{p.name}</span>
                      <span className="drawer-player-team">Team {p.team}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="drawer-panel-inner">
                <p className="drawer-chat-empty">No players yet.</p>
              </div>
            )}
          </div>
          <div
            className={`drawer-tab-panel ${activeTab === 'Log' ? 'drawer-tab-panel--active' : ''}`}
            role="tabpanel"
            id="drawer-panel-log"
            hidden={activeTab !== 'Log'}
          >
            <div className="drawer-panel-inner drawer-panel-inner--log">
              <GameLogPanel game={game} playerId={playerId} />
            </div>
          </div>
          <div
            className={`drawer-tab-panel ${activeTab === 'Theme' ? 'drawer-tab-panel--active' : ''}`}
            role="tabpanel"
            id="drawer-panel-theme"
            aria-labelledby="drawer-tab-theme"
          >
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
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Drawer;
