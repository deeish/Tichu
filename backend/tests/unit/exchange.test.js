/**
 * Unit tests for card exchange logic
 */

const { getExchangeRecipients, exchangeCards, completeExchange } = require('../../game/exchange');

describe('Card Exchange', () => {
  let game;

  beforeEach(() => {
    game = {
      state: 'exchanging',
      players: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      turnOrder: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      hands: {
        p1: [
          { type: 'standard', rank: '2', suit: 'hearts' },
          { type: 'standard', rank: '3', suit: 'hearts' },
          { type: 'standard', rank: '4', suit: 'hearts' },
          { type: 'standard', rank: '5', suit: 'hearts' },
          { type: 'standard', rank: '6', suit: 'hearts' }
        ],
        p2: [
          { type: 'standard', rank: '7', suit: 'hearts' },
          { type: 'standard', rank: '8', suit: 'hearts' },
          { type: 'standard', rank: '9', suit: 'hearts' },
          { type: 'standard', rank: '10', suit: 'hearts' },
          { type: 'standard', rank: 'J', suit: 'hearts' }
        ],
        p3: [
          { type: 'standard', rank: 'Q', suit: 'hearts' },
          { type: 'standard', rank: 'K', suit: 'hearts' },
          { type: 'standard', rank: 'A', suit: 'hearts' },
          { type: 'standard', rank: '2', suit: 'diamonds' },
          { type: 'standard', rank: '3', suit: 'diamonds' }
        ],
        p4: [
          { type: 'standard', rank: '4', suit: 'diamonds' },
          { type: 'standard', rank: '5', suit: 'diamonds' },
          { type: 'standard', rank: '6', suit: 'diamonds' },
          { type: 'standard', rank: '7', suit: 'diamonds' },
          { type: 'standard', rank: '8', suit: 'diamonds' }
        ]
      },
      exchangeCards: {},
      exchangeComplete: {},
      leadPlayer: 'p1'
    };
  });

  describe('getExchangeRecipients', () => {
    test('should return 3 recipients in turn order', () => {
      const recipients = getExchangeRecipients(game, 'p1');
      
      expect(recipients.length).toBe(3);
      expect(recipients[0].id).toBe('p2'); // Next player
      expect(recipients[1].id).toBe('p3'); // Next after that
      expect(recipients[2].id).toBe('p4'); // Last
    });

    test('should mark partner correctly', () => {
      const recipients = getExchangeRecipients(game, 'p1');
      
      expect(recipients[0].isPartner).toBe(true); // p2 is p1's partner
      expect(recipients[1].isPartner).toBe(false); // p3 is opponent
      expect(recipients[2].isPartner).toBe(false); // p4 is opponent
    });

    test('should wrap around turn order', () => {
      const recipients = getExchangeRecipients(game, 'p4');
      
      expect(recipients[0].id).toBe('p1'); // Wraps around
      expect(recipients[1].id).toBe('p2');
      expect(recipients[2].id).toBe('p3');
    });
  });

  describe('exchangeCards', () => {
    test('should store exchange cards', () => {
      const cardsToExchange = [
        { type: 'standard', rank: '2', suit: 'hearts' },
        { type: 'standard', rank: '3', suit: 'hearts' },
        { type: 'standard', rank: '4', suit: 'hearts' }
      ];
      
      const result = exchangeCards(game, 'p1', cardsToExchange);
      
      expect(result.success).toBe(true);
      expect(game.exchangeCards.p1).toEqual(cardsToExchange);
    });

    test('should reject exchange in wrong phase', () => {
      game.state = 'playing';
      
      const result = exchangeCards(game, 'p1', [
        { type: 'standard', rank: '2', suit: 'hearts' },
        { type: 'standard', rank: '3', suit: 'hearts' },
        { type: 'standard', rank: '4', suit: 'hearts' }
      ]);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exchange phase');
    });

    test('should require exactly 3 cards', () => {
      const result1 = exchangeCards(game, 'p1', [
        { type: 'standard', rank: '2', suit: 'hearts' },
        { type: 'standard', rank: '3', suit: 'hearts' }
      ]);
      
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('exactly 3 cards');
      
      const result2 = exchangeCards(game, 'p1', [
        { type: 'standard', rank: '2', suit: 'hearts' },
        { type: 'standard', rank: '3', suit: 'hearts' },
        { type: 'standard', rank: '4', suit: 'hearts' },
        { type: 'standard', rank: '5', suit: 'hearts' }
      ]);
      
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('exactly 3 cards');
    });

    test('should reject cards not in hand', () => {
      const result = exchangeCards(game, 'p1', [
        { type: 'standard', rank: 'K', suit: 'spades' }, // Not in p1's hand
        { type: 'standard', rank: '3', suit: 'hearts' },
        { type: 'standard', rank: '4', suit: 'hearts' }
      ]);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in hand');
    });
  });

  describe('completeExchange', () => {
    test('should complete exchange and transfer cards', () => {
      // Set up exchanges for all players
      game.exchangeCards = {
        p1: [
          { type: 'standard', rank: '2', suit: 'hearts' },
          { type: 'standard', rank: '3', suit: 'hearts' },
          { type: 'standard', rank: '4', suit: 'hearts' }
        ],
        p2: [
          { type: 'standard', rank: '7', suit: 'hearts' },
          { type: 'standard', rank: '8', suit: 'hearts' },
          { type: 'standard', rank: '9', suit: 'hearts' }
        ],
        p3: [
          { type: 'standard', rank: 'Q', suit: 'hearts' },
          { type: 'standard', rank: 'K', suit: 'hearts' },
          { type: 'standard', rank: 'A', suit: 'hearts' }
        ],
        p4: [
          { type: 'standard', rank: '4', suit: 'diamonds' },
          { type: 'standard', rank: '5', suit: 'diamonds' },
          { type: 'standard', rank: '6', suit: 'diamonds' }
        ]
      };
      
      const p1InitialHandLength = game.hands.p1.length;
      const result = completeExchange(game);
      
      expect(result.success).toBe(true);
      // p1 should receive cards from p4, p2, p3 (in that order based on turn order)
      // p1 gives: 2, 3, 4 to p2, p3, p4
      // p1 receives: from p4 (4d), p2 (7h), p3 (Qh)
      expect(game.hands.p1.length).toBe(p1InitialHandLength); // Same length (gave 3, received 3)
      expect(game.state).toBe('playing');
    });

    test('should reject if not all players exchanged', () => {
      game.exchangeCards = {
        p1: [
          { type: 'standard', rank: '2', suit: 'hearts' },
          { type: 'standard', rank: '3', suit: 'hearts' },
          { type: 'standard', rank: '4', suit: 'hearts' }
        ]
        // Missing p2, p3, p4
      };
      
      const result = completeExchange(game);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('All players must exchange');
    });

    test('should update lead player to new Mah Jong holder after exchange', () => {
      // Give Mah Jong to p3 initially
      game.hands.p3.push({ type: 'special', name: 'mahjong' });
      
      // Set up exchanges - p3's recipients are: p4 (1st), p1 (2nd), p2 (3rd)
      // So p3's 3rd card goes to p2
      game.exchangeCards = {
        p1: [
          { type: 'standard', rank: '2', suit: 'hearts' },
          { type: 'standard', rank: '3', suit: 'hearts' },
          { type: 'standard', rank: '4', suit: 'hearts' }
        ],
        p2: [
          { type: 'standard', rank: '7', suit: 'hearts' },
          { type: 'standard', rank: '8', suit: 'hearts' },
          { type: 'standard', rank: '9', suit: 'hearts' }
        ],
        p3: [
          { type: 'standard', rank: 'Q', suit: 'hearts' }, // Goes to p4 (1st recipient)
          { type: 'standard', rank: 'K', suit: 'hearts' }, // Goes to p1 (2nd recipient)
          { type: 'special', name: 'mahjong' } // Goes to p2 (3rd recipient)
        ],
        p4: [
          { type: 'standard', rank: '4', suit: 'diamonds' },
          { type: 'standard', rank: '5', suit: 'diamonds' },
          { type: 'standard', rank: '6', suit: 'diamonds' }
        ]
      };
      
      completeExchange(game);
      
      // p2 should receive Mah Jong from p3 (3rd card goes to 3rd recipient)
      // So p2 should be lead player
      expect(game.leadPlayer).toBe('p2');
    });
  });
});
