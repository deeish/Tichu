/**
 * Game initialization logic
 * Handles setting up new game rounds
 */

const { createTichuDeck, dealInitialCards } = require('./deck');

/**
 * Initializes a new game round
 */
function initializeGame(game) {
  // Create and deal cards in two phases
  const deck = createTichuDeck();
  const { initialHands, remainingCards, remainingDeck } = dealInitialCards(deck, 4);
  
  // Set up hands for each player (initially only 8 cards visible)
  game.hands = {};
  game.remainingCards = {}; // Store the 6 cards to be revealed
  game.cardsRevealed = {}; // Track which players have revealed their remaining cards
  
  game.players.forEach((player, index) => {
    game.hands[player.id] = initialHands[index];
    game.remainingCards[player.id] = remainingCards[index];
    game.cardsRevealed[player.id] = false;
  });
  
  // Find player with Mah Jong (check in initial 8 cards + remaining cards)
  // Need to check both initial hand and remaining cards since Mah Jong might be in the 6 remaining cards
  let mahJongPlayer = null;
  for (const player of game.players) {
    const fullHand = [...game.hands[player.id], ...game.remainingCards[player.id]];
    if (fullHand.some(card => card.name === 'mahjong')) {
      mahJongPlayer = player;
      break;
    }
  }
  
  // If Mah Jong not found (shouldn't happen, but safety check), use first player
  if (!mahJongPlayer) {
    mahJongPlayer = game.players[0];
    console.warn('Mah Jong not found, using first player as lead');
  }
  
  // Set up turn order (starting with Mah Jong player)
  const mahJongIndex = game.players.findIndex(p => p.id === mahJongPlayer.id);
  game.turnOrder = [
    ...game.players.slice(mahJongIndex),
    ...game.players.slice(0, mahJongIndex)
  ];
  game.currentPlayerIndex = 0;
  game.leadPlayer = mahJongPlayer.id;
  
  // Initialize game state
  game.deck = remainingDeck;
  game.currentTrick = [];
  game.trickHistory = [];
  game.passedPlayers = [];
  game.tichuDeclarations = {};
  game.grandTichuDeclarations = {};
  game.exchangeCards = {}; // Track cards being exchanged
  game.exchangeComplete = {}; // Track who has completed exchange
  game.roundScores = { team1: 0, team2: 0 };
  game.firstCardPlayed = {}; // Track if each player has played their first card (for Tichu declaration)
  game.mahJongWish = null; // Track Mah Jong wish: { wishedRank: string, mustPlay: boolean }
  game.mahJongPlayed = false; // Track if Mah Jong has been played this round
  game.playersOut = []; // Track players who have gone out, in order
  game.roundEnded = false; // Track if round has ended
  game.dragonOpponentSelection = null; // Track when Dragon player needs to choose opponent: { playerId, trickCards, trickPoints }
  game.dogPriorityPlayer = null; // Track player who has priority from Dog (cannot pass, must play)
  // Track per-player stacks (cards won in tricks) - only awarded at round end unless last place
  game.playerStacks = {}; // { playerId: { cards: [...], points: number } }
  game.players.forEach(player => {
    game.playerStacks[player.id] = { cards: [], points: 0 };
  });
  
  // Phase 1: Grand Tichu declarations (after seeing 8 cards)
  game.state = 'grand-tichu';
  
  return game;
}

module.exports = {
  initializeGame
};
