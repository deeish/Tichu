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

function statsForPlayerId(playerStats, playerId) {
  if (!playerStats || playerId == null) return {}
  const sid = String(playerId)
  return playerStats[sid] ?? playerStats[playerId] ?? {}
}

function buildRow(player, playerStats) {
  const stats = statsForPlayerId(playerStats, player.id)
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

/** Finished games: roster may shrink when people leave; keep one row per playerStats entry until the party is gone. */
function buildStatsPlayerList(players, game) {
  const safePlayers = Array.isArray(players) ? players : []
  const playerStats = game?.playerStats
  const statIds =
    playerStats && typeof playerStats === 'object' && !Array.isArray(playerStats)
      ? Object.keys(playerStats)
      : []

  if (game?.state === 'finished' && statIds.length > 0) {
    const nameById = new Map()
    for (const p of safePlayers) {
      if (p?.id != null) nameById.set(String(p.id), p.name ?? 'Player')
    }
    const turnOrder = Array.isArray(game.turnOrder) ? game.turnOrder : []
    for (const p of turnOrder) {
      if (p?.id != null) {
        const sid = String(p.id)
        if (!nameById.has(sid)) nameById.set(sid, p.name ?? 'Player')
      }
    }
    const roundLog = Array.isArray(game.roundLog) ? game.roundLog : []
    for (let i = roundLog.length - 1; i >= 0; i--) {
      const entryPlayers = roundLog[i]?.players
      if (!Array.isArray(entryPlayers)) continue
      for (const rp of entryPlayers) {
        const pid = rp?.playerId ?? rp?.id
        if (pid == null) continue
        const sid = String(pid)
        if (!nameById.has(sid)) {
          const nm = rp.playerName ?? rp.name
          if (nm) nameById.set(sid, nm)
        }
      }
    }
    const idSet = new Set(statIds.map(String))
    const orderedIds = []
    const seen = new Set()
    for (const p of turnOrder) {
      if (p?.id == null) continue
      const sid = String(p.id)
      if (idSet.has(sid) && !seen.has(sid)) {
        seen.add(sid)
        orderedIds.push(sid)
      }
    }
    for (const id of statIds) {
      const sid = String(id)
      if (!seen.has(sid)) {
        seen.add(sid)
        orderedIds.push(sid)
      }
    }
    return orderedIds.map((sid) => ({
      id: sid,
      name: nameById.get(sid) ?? 'Player',
    }))
  }

  if (safePlayers.length > 0) return safePlayers
  return [
    { id: '1', name: 'Player 1' },
    { id: '2', name: 'Player 2' },
    { id: '3', name: 'Player 3' },
    { id: '4', name: 'Player 4' },
  ]
}

function StatsPopup({ open, onClose, players = [], game = null }) {
  if (!open) return null

  const playerStats = game?.playerStats || null
  const list = buildStatsPlayerList(players, game)

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
              {list.map((p) => {
                const row = buildRow(p, playerStats)
                return (
                <tr key={String(p.id)} className="stats-popup-tr">
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="stats-popup-td">
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default StatsPopup
