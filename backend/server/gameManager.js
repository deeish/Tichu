/**
 * Game management logic
 * Handles game creation, team assignment, and game starting
 */

const { initializeGame, revealRemainingCards } = require('../game/gameState');

/**
 * Fisher–Yates shuffle (in-place). Used to randomize team assignment.
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Randomly assigns teams to 4 players so that exactly 2 are on team 1 and 2 on team 2.
 * Any two players can end up on the same team (truly random split).
 * Returns array of team assignments, e.g. [1, 2, 1, 2] or [2, 1, 2, 1].
 */
function assignRandomTeams(numPlayers) {
  const indices = shuffleArray([0, 1, 2, 3].slice(0, numPlayers));
  const result = [1, 1, 2, 2]; // default 0,1 = team 1; 2,3 = team 2
  indices.forEach((playerIndex, i) => {
    result[playerIndex] = i < 2 ? 1 : 2;
  });
  return result;
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

/**
 * Test game setup: set one player as Grand Tichu (so we can see the tag).
 * Mah Jong is left wherever the deal put it.
 */
function setupTestGameRigging(game) {
  if (!game.players.some(p => p.isTestPlayer)) return;

  // One test player has already called Grand Tichu (so we can see the tag)
  const grandTichuPlayer = game.players.find((p, i) => i > 0 && p.isTestPlayer);
  if (grandTichuPlayer) {
    game.grandTichuDeclarations = game.grandTichuDeclarations || {};
    game.grandTichuDeclarations[grandTichuPlayer.id] = true;
  }
}

/**
 * Reorder game.players so partners sit across the table.
 * Table positions: 0 = bottom, 1 = left, 2 = top, 3 = right. Partners sit opposite: 0&2, 1&3.
 * Mutates the existing array in place so any reference to game.players sees the new order.
 */
function seatPlayersByTeam(game) {
  if (!game.players || game.players.length !== 4) return;
  const team1 = game.players.filter(p => (p.team === 2 ? 2 : 1) === 1);
  const team2 = game.players.filter(p => p.team === 2);
  if (team1.length !== 2 || team2.length !== 2) {
    console.warn('seatPlayersByTeam: need exactly 2 per team, got', team1.length, 'and', team2.length);
    return;
  }
  const newOrder = [team1[0], team2[0], team1[1], team2[1]];
  for (let i = 0; i < 4; i++) {
    game.players[i] = newOrder[i];
  }
  console.log('Seating (partners across):', game.players.map((p, i) => `${p.name}(T${p.team})@${i}`).join(', '));
}

function startGame(gameId, games, broadcastGameUpdate) {
  const game = games.get(gameId);
  if (!game) return;
  if (game.state !== 'waiting') {
    console.warn('startGame called but game state was', game.state, '- ignoring');
    return;
  }

  console.log('Starting game', gameId, '(host clicked Start game)');
  // Seat players so partners sit across (positions 0&2 and 1&3)
  seatPlayersByTeam(game);
  // Clear round log at start of each new game (so Log tab is empty until rounds complete).
  // Keep log for test games so the Log tab can still show mock/previous data for testing.
  const isTestGame = game.players.some((p) => p.isTestPlayer);
  if (!isTestGame) {
    game.roundLog = [];
  }

  // Initialize the game (deal cards, set up state)
  initializeGame(game);

  // Test games: one bot has Grand Tichu (Mah Jong stays where dealt)
  setupTestGameRigging(game);
  
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
