import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import StatsPopup from '../StatsPopup'

describe('StatsPopup', () => {
  const defaultPlayers = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Carol' },
    { id: 'p4', name: 'Dave' },
  ]

  const defaultGame = {
    playerStats: {
      p1: { dog: 1, phoenix: 0, dragon: 0, mahJong: 0, bombs: 1, points: 45, tichuCalls: 1, tichuWins: 1, grandCalls: 0, grandWins: 0, firstPlace: 1, lastPlace: 0 },
      p2: { dog: 0, phoenix: 1, dragon: 0, mahJong: 0, bombs: 0, points: 30, tichuCalls: 0, tichuWins: 0, grandCalls: 1, grandWins: 0, firstPlace: 0, lastPlace: 0 },
      p3: { dog: 0, phoenix: 0, dragon: 1, mahJong: 0, bombs: 0, points: 15, tichuCalls: 1, tichuWins: 0, grandCalls: 0, grandWins: 0, firstPlace: 0, lastPlace: 0 },
      p4: { dog: 0, phoenix: 0, dragon: 0, mahJong: 1, bombs: 0, points: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0, firstPlace: 0, lastPlace: 1 },
    },
  }

  it('renders nothing when open is false', () => {
    const { container } = render(
      <StatsPopup open={false} onClose={() => {}} players={defaultPlayers} game={defaultGame} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog with title and table when open', () => {
    const { container } = render(
      <StatsPopup open={true} onClose={() => {}} players={defaultPlayers} game={defaultGame} />
    )
    const dialog = within(container).getByRole('dialog', { name: /game stats/i })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Game stats')).toBeInTheDocument()
    expect(within(dialog).getByText('Alice')).toBeInTheDocument()
    expect(within(dialog).getByText('Bob')).toBeInTheDocument()
    expect(within(dialog).getByText('Points (team)')).toBeInTheDocument()
    expect(within(dialog).getByText('45')).toBeInTheDocument()
    expect(within(dialog).getByText('1–0 (100%)')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <StatsPopup open={true} onClose={onClose} players={defaultPlayers} game={defaultGame} />
    )
    fireEvent.click(within(container).getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('handles missing game or playerStats without crashing', () => {
    const { container } = render(
      <StatsPopup open={true} onClose={() => {}} players={defaultPlayers} game={null} />
    )
    const dialog = within(container).getByRole('dialog', { name: /game stats/i })
    expect(within(dialog).getByText('Game stats')).toBeInTheDocument()
    expect(within(dialog).getByText('Alice')).toBeInTheDocument()
  })

  it('uses fallback player list when players is empty', () => {
    const { container } = render(
      <StatsPopup open={true} onClose={() => {}} players={[]} game={{ playerStats: {} }} />
    )
    const dialog = within(container).getByRole('dialog', { name: /game stats/i })
    expect(within(dialog).getByText('Game stats')).toBeInTheDocument()
    expect(within(dialog).getByText('Player 1')).toBeInTheDocument()
    expect(within(dialog).getByText('Player 4')).toBeInTheDocument()
  })

  it('finished game: keeps rows for players who left (uses playerStats + turnOrder names)', () => {
    const playersAfterLeave = [
      { id: 'p1', name: 'Alice' },
      { id: 'p3', name: 'Carol' },
    ]
    const game = {
      state: 'finished',
      playerStats: defaultGame.playerStats,
      turnOrder: defaultPlayers.map((p) => ({ id: p.id, name: p.name, team: 1 })),
    }
    const { container } = render(
      <StatsPopup open={true} onClose={() => {}} players={playersAfterLeave} game={game} />
    )
    const dialog = within(container).getByRole('dialog', { name: /game stats/i })
    expect(within(dialog).getByText('Alice')).toBeInTheDocument()
    expect(within(dialog).getByText('Bob')).toBeInTheDocument()
    expect(within(dialog).getByText('Carol')).toBeInTheDocument()
    expect(within(dialog).getByText('Dave')).toBeInTheDocument()
    const rows = within(dialog).getAllByRole('row')
    expect(rows.length).toBe(5)
  })

  it('finished game: fills names from roundLog when turnOrder matches short players list (client normalize)', () => {
    const playersAfterLeave = [{ id: 'p1', name: 'Alice' }, { id: 'p3', name: 'Carol' }]
    const game = {
      state: 'finished',
      playerStats: defaultGame.playerStats,
      turnOrder: [...playersAfterLeave],
      roundLog: [
        {
          round: 99,
          players: defaultPlayers.map((p) => ({
            playerId: p.id,
            playerName: p.name,
            team: 1,
            total: 0,
          })),
        },
      ],
    }
    const { container } = render(
      <StatsPopup open={true} onClose={() => {}} players={playersAfterLeave} game={game} />
    )
    const dialog = within(container).getByRole('dialog', { name: /game stats/i })
    expect(within(dialog).getByText('Bob')).toBeInTheDocument()
    expect(within(dialog).getByText('Dave')).toBeInTheDocument()
  })
})
