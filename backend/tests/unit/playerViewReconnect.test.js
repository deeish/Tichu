/**
 * Unit tests for getPlayerView reconnection behavior.
 * Ensures reconnecting clients (new socket.id) get the same hand via stable player.id.
 */

const { getPlayerView } = require('../../game/playerView');

describe('getPlayerView (reconnection)', () => {
  test('resolves by socketId and returns hand keyed by stable player.id', () => {
    const stableId = 'player-uuid-123';
    const socketId = 'socket-abc';
    const game = {
      id: 'GAME1',
      players: [
        { id: stableId, socketId, name: 'Alice', team: 1, token: 'tok1' }
      ],
      hands: {
        [stableId]: [{ type: 'standard', rank: 'A', suit: 'hearts' }]
      }
    };
    const view = getPlayerView(game, socketId);
    expect(view.hands[stableId]).toHaveLength(1);
    expect(view.hands[stableId][0].rank).toBe('A');
  });

  test('after "reconnect" (new socketId, same player.id) client gets same hand', () => {
    const stableId = 'player-uuid-456';
    const oldSocketId = 'socket-old';
    const newSocketId = 'socket-new';
    const hand = [{ type: 'standard', rank: 'K', suit: 'spades' }];
    const game = {
      id: 'GAME2',
      players: [
        { id: stableId, socketId: newSocketId, name: 'Bob', team: 2, token: 'tok2', disconnected: false }
      ],
      hands: { [stableId]: hand }
    };
    const view = getPlayerView(game, newSocketId);
    expect(view.hands[stableId]).toEqual(hand);
    expect(view.players[0].token).toBe('tok2');
  });

  test('only requesting player gets token in view', () => {
    const game = {
      id: 'GAME3',
      players: [
        { id: 'p1', socketId: 's1', name: 'A', token: 't1' },
        { id: 'p2', socketId: 's2', name: 'B', token: 't2' }
      ],
      hands: { p1: [], p2: [] }
    };
    const view = getPlayerView(game, 's1');
    expect(view.players.find((p) => p.id === 'p1').token).toBe('t1');
    expect(view.players.find((p) => p.id === 'p2').token).toBeUndefined();
  });

  test('includes only own exchangeReceipt and omits exchangeReceiptByPlayer map', () => {
    const game = {
      id: 'GAME4',
      state: 'playing',
      players: [
        { id: 'p1', socketId: 's1', name: 'A', team: 1 },
        { id: 'p2', socketId: 's2', name: 'B', team: 2 },
      ],
      hands: { p1: [], p2: [] },
      exchangeReceiptByPlayer: {
        p1: [{ fromPlayerId: 'p2', fromPlayerName: 'B', isPartner: false, card: { type: 'standard', rank: '2', suit: 'hearts' } }],
        p2: [{ fromPlayerId: 'p1', fromPlayerName: 'A', isPartner: false, card: { type: 'standard', rank: '3', suit: 'hearts' } }],
      },
    };
    const v1 = getPlayerView(game, 's1');
    expect(v1.exchangeReceipt).toHaveLength(1);
    expect(v1.exchangeReceipt[0].fromPlayerId).toBe('p2');
    expect(v1.exchangeReceiptByPlayer).toBeUndefined();

    const v2 = getPlayerView(game, 's2');
    expect(v2.exchangeReceipt[0].fromPlayerId).toBe('p1');
    expect(v2.exchangeReceiptByPlayer).toBeUndefined();
  });
});
