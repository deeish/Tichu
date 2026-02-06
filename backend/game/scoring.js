/**
 * Scoring and round ending logic
 * Handles player wins, round scoring, and game completion
 */

const { initializeGame } = require('./initialization');
const { getCurrentWinningPlay } = require('./trickManager');
const { getCardPoints } = require('./deck');

/**
 * Handles when a player empties their hand
 */
function handlePlayerWin(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  
  // Track that this player has gone out
  if (!game.playersOut.includes(playerId)) {
    game.playersOut.push(playerId);
  }
  
  // Double victory: team finishes 1st and 2nd -> +200, no card points, only Tichu applied
  // Trigger as soon as 2nd player goes out (even if their play is still in currentTrick)
  if (game.playersOut.length === 2) {
    const firstPlayer = game.players.find(p => p.id === game.playersOut[0]);
    const secondPlayer = game.players.find(p => p.id === game.playersOut[1]);
    
    if (firstPlayer && secondPlayer && firstPlayer.team === secondPlayer.team) {
      // Clear current trick without assigning points (no card points in double victory)
      game.currentTrick = [];
      game.passedPlayers = [];
      
      // Add remaining players to playersOut (they're last)
      const remainingPlayers = game.players.filter(p => !game.playersOut.includes(p.id));
      remainingPlayers.forEach(p => {
        if (!game.playersOut.includes(p.id)) {
          game.playersOut.push(p.id);
        }
        const remainingCards = game.hands[p.id] || [];
        if (!game.playerStacks[p.id]) {
          game.playerStacks[p.id] = { cards: [], points: 0 };
        }
        game.playerStacks[p.id].cards.push(...remainingCards);
      });
      
      game.roundScores = { team1: 0, team2: 0 };
      game.roundScores[`team${firstPlayer.team}`] = 200;
      
      const tichuDeclarations = game.tichuDeclarations || {};
      const grandTichuDeclarations = game.grandTichuDeclarations || {};
      for (const p of game.players) {
        if (tichuDeclarations[p.id] && game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] += 100;
        }
        if (grandTichuDeclarations[p.id] && game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] += 200;
        }
        if (tichuDeclarations[p.id] && !game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] -= 100;
        }
        if (grandTichuDeclarations[p.id] && !game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] -= 200;
        }
      }
      
      game.roundEnded = true;
      game.state = 'round-ended';
      if (game.scores) {
        game.scores.team1 = (game.scores.team1 || 0) + game.roundScores.team1;
        game.scores.team2 = (game.scores.team2 || 0) + game.roundScores.team2;
      }
      if (game.scores && (game.scores.team1 >= 1000 || game.scores.team2 >= 1000)) {
        game.state = 'finished';
        game.winner = game.scores.team1 >= 1000 ? 1 : 2;
      } else {
        initializeGame(game);
      }
      return { success: true, game, playerWon: true, doubleVictory: true };
    }
  }
  
  // Round ends when 3 of 4 have finished (tailender) OR when all 4 are out
  const playersWithCards = game.players.filter(p => !game.playersOut.includes(p.id));
  
  // Tailender: only when trick is empty, so the 4th player gets their turn if 3rd went out mid-trick
  if (playersWithCards.length === 1 && (!game.currentTrick || game.currentTrick.length === 0)) {
    const lastPlayer = playersWithCards[0];
    if (!game.playersOut.includes(lastPlayer.id)) {
      game.playersOut.push(lastPlayer.id);
    }
    const remainingCards = game.hands[lastPlayer.id] || [];
    if (!game.playerStacks[lastPlayer.id]) {
      game.playerStacks[lastPlayer.id] = { cards: [], points: 0 };
    }
    game.playerStacks[lastPlayer.id].cards.push(...remainingCards);
    game.roundEnded = true;
    game.state = 'round-ended';
  }
  
  // All 4 out (e.g. 4th player just went out): resolve current trick if any, then end round
  if (game.playersOut.length === 4 && !game.roundEnded) {
    if (game.currentTrick && game.currentTrick.length > 0) {
      const winningPlay = getCurrentWinningPlay(game.currentTrick);
      const winnerId = winningPlay ? winningPlay.playerId : game.currentTrick[0]?.playerId;
      if (winnerId) {
        let trickPoints = 0;
        for (const play of game.currentTrick) {
          for (const card of play.cards) {
            trickPoints += getCardPoints(card);
          }
        }
        if (!game.playerStacks[winnerId]) {
          game.playerStacks[winnerId] = { cards: [], points: 0 };
        }
        for (const play of game.currentTrick) {
          game.playerStacks[winnerId].cards.push(...play.cards);
        }
        game.playerStacks[winnerId].points += trickPoints;
      }
      game.currentTrick = [];
      game.passedPlayers = [];
    }
    game.roundEnded = true;
    game.state = 'round-ended';
  }
  
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
    const tichuDeclarations = game.tichuDeclarations || {};
    const grandTichuDeclarations = game.grandTichuDeclarations || {};
    if (tichuDeclarations[player.id] && game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] += 100;
    }
    if (grandTichuDeclarations[player.id] && game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] += 200;
    }
    if (tichuDeclarations[player.id] && !game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] -= 100;
    }
    if (grandTichuDeclarations[player.id] && !game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] -= 200;
    }
  }
  
  // Update total scores (guard for test games that may not have scores)
  if (game.scores) {
    game.scores.team1 = (game.scores.team1 || 0) + game.roundScores.team1;
    game.scores.team2 = (game.scores.team2 || 0) + game.roundScores.team2;
  }
  
  if (game.scores && (game.scores.team1 >= 1000 || game.scores.team2 >= 1000)) {
    game.state = 'finished';
    game.winner = game.scores.team1 >= 1000 ? 1 : 2;
  } else {
    initializeGame(game);
  }
  
  return { success: true, game, playerWon: true, roundEnded: true };
}

module.exports = {
  handlePlayerWin
};
