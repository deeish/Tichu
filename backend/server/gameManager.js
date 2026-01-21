/**
 * Game management logic
 * Handles game creation, team assignment, and game starting
 */

const { initializeGame, revealRemainingCards } = require('../game/gameState');

/**
 * Randomly assigns teams to 4 players
 * In Tichu, partners sit opposite each other:
 * - Positions 0 & 2 are partners
 * - Positions 1 & 3 are partners
 * Returns array of team assignments [team1, team2, team1, team2] or [team2, team1, team2, team1]
 */
function assignRandomTeams(numPlayers) {
  // Randomly decide which pair gets team 1
  const firstPairTeam = Math.random() < 0.5 ? 1 : 2;
  const secondPairTeam = firstPairTeam === 1 ? 2 : 1;
  
  // Partners sit opposite: 0&2, 1&3
  return [
    firstPairTeam,   // Position 0
    secondPairTeam,  // Position 1
    firstPairTeam,   // Position 2 (partner of 0)
    secondPairTeam   // Position 3 (partner of 1)
  ];
}

/**
 * Assigns random teams to all players in a game
 */
function assignRandomTeamsToGame(game) {
  if (game.players.length !== 4) return;
  
  const teamAssignment = assignRandomTeams(4);
  game.players.forEach((player, index) => {
    player.team = teamAssignment[index];
  });
  
  console.log(`Teams assigned: ${game.players.map(p => `${p.name} (Team ${p.team})`).join(', ')}`);
}

function startGame(gameId, games, broadcastGameUpdate) {
  const game = games.get(gameId);
  if (!game) return;

  // Initialize the game (deal cards, set up state)
  initializeGame(game);
  
  // Broadcast game started to all players
  broadcastGameUpdate(game);
  
  // Auto-handle test players in Grand Tichu phase
  if (game.state === 'grand-tichu') {
    // Test players automatically reveal cards (skip Grand Tichu)
    setTimeout(() => {
      const testPlayers = game.players.filter(p => p.isTestPlayer);
      testPlayers.forEach(testPlayer => {
        if (!game.cardsRevealed[testPlayer.id]) {
          revealRemainingCards(game, testPlayer.id);
        }
      });
      broadcastGameUpdate(game);
      
      // Auto-advance to exchange phase when all revealed
      setTimeout(() => {
        if (game.state === 'grand-tichu') {
          const allRevealed = game.players.every(p => game.cardsRevealed[p.id]);
          if (allRevealed) {
            game.state = 'exchanging';
            broadcastGameUpdate(game);
            
            // Auto-exchange for test players
            const testPlayers = game.players.filter(p => p.isTestPlayer);
            testPlayers.forEach(testPlayer => {
              const testHand = game.hands[testPlayer.id] || [];
              if (testHand.length >= 3) {
                game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
                game.exchangeComplete[testPlayer.id] = true;
              }
            });
            broadcastGameUpdate(game);
          }
        }
      }, 1000);
    }, 500);
  }
}

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = {
  assignRandomTeams,
  assignRandomTeamsToGame,
  startGame,
  generateGameId
};
