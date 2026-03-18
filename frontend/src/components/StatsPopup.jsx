import './StatsPopup.css'

const COLUMNS = [
  { key: 'player', label: 'Player' },
  { key: 'dog', label: 'Dog' },
  { key: 'phoenix', label: 'Phoenix' },
  { key: 'dragon', label: 'Dragon' },
  { key: 'mahJong', label: 'Mah Jong' },
  { key: 'bombs', label: 'Bombs' },
  { key: 'points', label: 'Points (team)' },
  { key: 'tichuCalls', label: 'Tichu' },
  { key: 'grandCalls', label: 'Grand' },
  { key: 'firstPlace', label: 'First place' },
  { key: 'lastPlace', label: 'Last place' },
]

/** Format win/loss and win % for Tichu or Grand. Returns "W–L (Pct%)" or "—" if no calls. */
function formatCallRecord(calls, wins) {
  const c = calls ?? 0
  if (c === 0) return '—'
  const w = wins ?? 0
  const loss = c - w
  const pct = c > 0 ? Math.round((w / c) * 100) : 0
  return `${w}–${loss} (${pct}%)`
}

function buildRow(player, playerStats) {
  const stats = playerStats?.[player.id] || {}
  return {
    player: player.name,
    dog: stats.dog ?? '—',
    phoenix: stats.phoenix ?? '—',
    dragon: stats.dragon ?? '—',
    mahJong: stats.mahJong ?? '—',
    bombs: stats.bombs ?? '—',
    points: stats.points ?? '—',
    tichuCalls: formatCallRecord(stats.tichuCalls, stats.tichuWins),
    grandCalls: formatCallRecord(stats.grandCalls, stats.grandWins),
    firstPlace: stats.firstPlace ?? '—',
    lastPlace: stats.lastPlace ?? '—',
  }
}

function StatsPopup({ open, onClose, players = [], game = null }) {
  if (!open) return null

  const playerStats = game?.playerStats || null
  const safePlayers = Array.isArray(players) ? players : []
  const list = safePlayers.length
    ? safePlayers
    : [{ id: '1', name: 'Player 1' }, { id: '2', name: 'Player 2' }, { id: '3', name: 'Player 3' }, { id: '4', name: 'Player 4' }]
  const rows = list.map((p) => buildRow(p, playerStats))

  return (
    <div className="stats-popup-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="stats-popup-title">
      <div className="stats-popup" onClick={(e) => e.stopPropagation()}>
        <div className="stats-popup-header">
          <h2 id="stats-popup-title" className="stats-popup-title">Game stats</h2>
          <button type="button" className="stats-popup-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="stats-popup-body">
          <table className="stats-popup-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="stats-popup-th">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="stats-popup-tr">
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="stats-popup-td">
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default StatsPopup
