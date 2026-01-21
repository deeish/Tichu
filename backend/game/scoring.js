/**
 * Scoring and round ending logic
 * Handles player wins, round scoring, and game completion
 */

const { initializeGame } = require('./initialization');

/**
 * Handles when a player empties their hand
 */
function handlePlayerWin(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  
  // Track that this player has gone out
  if (!game.playersOut.includes(playerId)) {
    game.playersOut.push(playerId);
  }
  
  // Check for double victory: both teammates go out 1st and 2nd
  if (game.playersOut.length === 2) {
    const firstPlayer = game.players.find(p => p.id === game.playersOut[0]);
    const secondPlayer = game.players.find(p => p.id === game.playersOut[1]);
    
    if (firstPlayer && secondPlayer && firstPlayer.team === secondPlayer.team) {
      // Double victory! Team gets 200 points, skip counting cards
      // Add remaining players to playersOut (they're last)
      const remainingPlayers = game.players.filter(p => !game.playersOut.includes(p.id));
      remainingPlayers.forEach(p => {
        if (!game.playersOut.includes(p.id)) {
          game.playersOut.push(p.id);
        }
        // Add their remaining cards to stack (0 points)
        const remainingCards = game.hands[p.id] || [];
        if (!game.playerStacks[p.id]) {
          game.playerStacks[p.id] = { cards: [], points: 0 };
        }
        game.playerStacks[p.id].cards.push(...remainingCards);
      });
      
      // Double victory: winning team gets 200 points, losing team gets 0 (card points don't count)
      game.roundScores = { team1: 0, team2: 0 };
      
      // Set winning team to 200 points (base for double victory)
      game.roundScores[`team${firstPlayer.team}`] = 200;
      
      // Apply Tichu bonuses/penalties
      for (const p of game.players) {
        // Successful Tichu declarations (winning team only, since they finished)
        if (game.tichuDeclarations[p.id] && game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] += 100;
        }
        if (game.grandTichuDeclarations[p.id] && game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] += 200;
        }
        // Failed Tichu declarations (losing team only, since they didn't finish)
        if (game.tichuDeclarations[p.id] && !game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] -= 100;
        }
        if (game.grandTichuDeclarations[p.id] && !game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] -= 200;
        }
      }
      
      game.roundEnded = true;
      game.state = 'round-ended';
      
      // Update total scores
      game.scores.team1 += game.roundScores.team1;
      game.scores.team2 += game.roundScores.team2;
      
      // Check for game win (1000 points)
      if (game.scores.team1 >= 1000 || game.scores.team2 >= 1000) {
        game.state = 'finished';
        game.winner = game.scores.team1 >= 1000 ? 1 : 2;
      } else {
        // Start new round
        initializeGame(game);
      }
      
      return { success: true, game, playerWon: true, doubleVictory: true };
    }
  }
  
  // Check if round should end (only one player has cards left = tailender)
  const playersWithCards = game.players.filter(p => !game.playersOut.includes(p.id));
  
  if (playersWithCards.length === 1) {
    // Round ends - add last player to playersOut
    const lastPlayer = playersWithCards[0];
    if (!game.playersOut.includes(lastPlayer.id)) {
      game.playersOut.push(lastPlayer.id);
    }
    
    // Add last player's remaining cards to their stack (they go to opponents, but count as 0 points)
    const remainingCards = game.hands[lastPlayer.id] || [];
    if (!game.playerStacks[lastPlayer.id]) {
      game.playerStacks[lastPlayer.id] = { cards: [], points: 0 };
    }
    game.playerStacks[lastPlayer.id].cards.push(...remainingCards);
    // Remaining cards count as 0 points (already initialized)
    
    game.roundEnded = true;
    game.state = 'round-ended';
  }
  
  // If round hasn't ended yet, continue playing
  if (!game.roundEnded) {
    return { success: true, game, playerWon: true };
  }
  
  // Round ended - finalize scoring
  // Finish order: playersOut[0] = 1st, playersOut[1] = 2nd, playersOut[2] = 3rd, playersOut[3] = 4th (last)
  
  // Last place penalty: last player gives all their points to first place
  // This includes negative points (from Phoenix) - last place transfers ALL points
  if (game.playersOut.length === 4) {
    const firstPlaceId = game.playersOut[0];
    const lastPlaceId = game.playersOut[3];
    
    if (game.playerStacks[lastPlaceId]) {
      const lastPlacePoints = game.playerStacks[lastPlaceId].points || 0;
      // Transfer ALL points from last to first (including negative points from Phoenix)
      if (!game.playerStacks[firstPlaceId]) {
        game.playerStacks[firstPlaceId] = { cards: [], points: 0 };
      }
      game.playerStacks[firstPlaceId].points += lastPlacePoints;
      game.playerStacks[lastPlaceId].points = 0; // Last place gets 0 points
    }
  }
  
  // Calculate team scores from player stacks
  game.roundScores = { team1: 0, team2: 0 };
  for (const player of game.players) {
    const stack = game.playerStacks[player.id];
    if (stack) {
      game.roundScores[`team${player.team}`] += stack.points;
    }
  }
  
  // Apply Tichu bonuses/penalties
  for (const player of game.players) {
    // Successful Tichu declarations
    if (game.tichuDeclarations[player.id] && game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] += 100;
    }
    if (game.grandTichuDeclarations[player.id] && game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] += 200;
    }
    
    // Failed Tichu declarations (declared but didn't finish)
    if (game.tichuDeclarations[player.id] && !game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] -= 100;
    }
    if (game.grandTichuDeclarations[player.id] && !game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] -= 200;
    }
  }
  
  // Update total scores
  game.scores.team1 += game.roundScores.team1;
  game.scores.team2 += game.roundScores.team2;
  
  // Check for game win (1000 points)
  if (game.scores.team1 >= 1000 || game.scores.team2 >= 1000) {
    game.state = 'finished';
    game.winner = game.scores.team1 >= 1000 ? 1 : 2;
  } else {
    // Start new round
    initializeGame(game);
  }
  
  return { success: true, game, playerWon: true, roundEnded: true };
}

module.exports = {
  handlePlayerWin
};
