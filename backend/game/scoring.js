/**
 * Scoring and round ending logic
 * Handles player wins, round scoring, and game completion
 */

const { initializeGame } = require('./initialization');
const { getCurrentWinningPlay } = require('./trickManager');
const { getCardPoints } = require('./deck');
const { WINNING_SCORE } = require('../config/gameRules');

/**
 * Build a human-readable point label for a card (for round log breakdown)
 */
function getCardPointLabel(card) {
  if (card.type === 'special') {
    if (card.name === 'dragon') return 'Dragon';
    if (card.name === 'phoenix') return 'Phoenix';
    return null;
  }
  if (card.rank === '5') return '5';
  if (card.rank === '10') return '10';
  if (card.rank === 'K') return 'K';
  return null;
}

/**
 * Build one round-log entry from current game state (after round end, before next round).
 * Matches frontend shape: { round, players: [ { playerId, playerName, team, breakdown, tichu, grandTichu, total } ] }
 */
function buildRoundLogEntry(game) {
  if (!game.players || game.players.length === 0 || !game.playersOut || game.playersOut.length !== 4) {
    return null;
  }
  const firstPlaceId = game.playersOut[0] != null ? String(game.playersOut[0]) : null;
  const tichuDec = game.tichuDeclarations || {};
  const grandTichuDec = game.grandTichuDeclarations || {};

  const players = game.players.map((player) => {
    const pid = player.id != null ? String(player.id) : null;
    const gotFirst = firstPlaceId !== null && pid !== null && firstPlaceId === pid;
    const stack = game.playerStacks && game.playerStacks[player.id] ? game.playerStacks[player.id] : { cards: [], points: 0 };

    const breakdownMap = {};
    for (const card of stack.cards || []) {
      const label = getCardPointLabel(card);
      if (label == null) continue;
      const pts = getCardPoints(card);
      const key = label;
      if (!breakdownMap[key]) breakdownMap[key] = { count: 0, points: 0 };
      breakdownMap[key].count += 1;
      breakdownMap[key].points += pts;
    }
    const breakdown = Object.entries(breakdownMap).map(([label, { count, points }]) => ({
      label: count > 1 ? `${count}×${label}` : `1×${label}`,
      points
    })).sort((a, b) => b.points - a.points);

    let tichu = null;
    if (tichuDec[player.id]) tichu = gotFirst ? 100 : -100;
    let grandTichu = null;
    if (grandTichuDec[player.id]) grandTichu = gotFirst ? 200 : -200;

    const cardTotal = stack.points || 0;
    const total = cardTotal + (tichu ?? 0) + (grandTichu ?? 0);

    return {
      playerId: player.id,
      playerName: player.name || `Player ${player.id}`,
      team: player.team ?? 1,
      breakdown,
      tichu,
      grandTichu,
      total
    };
  });

  const roundNumber = Array.isArray(game.roundLog) ? game.roundLog.length + 1 : 1;
  return { round: roundNumber, players };
}

/**
 * Append current round to game.roundLog (creates roundLog if missing).
 * Call once when round has ended, after last-place transfer and Tichu/Grand applied.
 */
function appendRoundToLog(game) {
  const entry = buildRoundLogEntry(game);
  if (!entry) return;
  if (!game.roundLog) game.roundLog = [];
  game.roundLog.push(entry);
}

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
  // Use string comparison so id type mismatch (e.g. socket id vs player.id) never skips round end (BUGS.md: round sometimes doesn't end)
  if (game.playersOut.length === 2) {
    const firstId = game.playersOut[0] != null ? String(game.playersOut[0]) : null;
    const secondId = game.playersOut[1] != null ? String(game.playersOut[1]) : null;
    const firstPlayer = firstId ? game.players.find(p => p.id != null && String(p.id) === firstId) : null;
    const secondPlayer = secondId ? game.players.find(p => p.id != null && String(p.id) === secondId) : null;

    if (firstPlayer && secondPlayer && firstPlayer.team === secondPlayer.team) {
      // Clear current trick without assigning points (no card points in double victory)
      game.currentTrick = [];
      game.passedPlayers = [];
      
      // Add remaining players to playersOut (they're last); use string id compare so we never skip (id type consistency)
      const outSet = new Set(game.playersOut.map(id => String(id)));
      const remainingPlayers = game.players.filter(p => !outSet.has(String(p.id)));
      remainingPlayers.forEach(p => {
        if (!outSet.has(String(p.id))) {
          game.playersOut.push(p.id);
          outSet.add(String(p.id));
        }
        const remainingCards = game.hands[p.id] || [];
        if (!game.playerStacks[p.id]) {
          game.playerStacks[p.id] = { cards: [], points: 0 };
        }
        game.playerStacks[p.id].cards.push(...remainingCards);
      });
      
      game.roundScores = { team1: 0, team2: 0 };
      game.roundScores[`team${firstPlayer.team}`] = 200;
      
      // Tichu/Grand Tichu: +100/+200 only if player got FIRST; otherwise -100/-200 (BUGS.md: can get negative points)
      const firstPlaceIdDouble = game.playersOut && game.playersOut[0] != null ? String(game.playersOut[0]) : null;
      const tichuDec = game.tichuDeclarations || {};
      const grandTichuDec = game.grandTichuDeclarations || {};
      for (const p of game.players) {
        const pid = p.id != null ? String(p.id) : null;
        const gotFirst = firstPlaceIdDouble !== null && pid !== null && firstPlaceIdDouble === pid;
        if (tichuDec[p.id]) {
          game.roundScores[`team${p.team}`] += gotFirst ? 100 : -100;
        }
        if (grandTichuDec[p.id]) {
          game.roundScores[`team${p.team}`] += gotFirst ? 200 : -200;
        }
      }
      
      game.roundEnded = true;
      game.state = 'round-ended';
      updatePlayerStatsForRoundEnd(game);
      if (game.scores) {
        game.scores.team1 = (game.scores.team1 || 0) + game.roundScores.team1;
        game.scores.team2 = (game.scores.team2 || 0) + game.roundScores.team2;
      }
      appendRoundToLog(game);
      if (game.scores && (game.scores.team1 >= WINNING_SCORE || game.scores.team2 >= WINNING_SCORE)) {
        game.state = 'finished';
        // If both hit 1000 in same round, team with more points wins; else first to 1000 wins
        game.winner = game.scores.team1 >= game.scores.team2 ? 1 : 2;
      } else {
        initializeGame(game);
      }
      return { success: true, game, playerWon: true, doubleVictory: true };
    }
  }
  
  // Round ends when 3 of 4 have finished (tailender) OR when all 4 are out
  // BUGS.md: When P1,P2,P3 are out, round ends immediately; P4 cannot play more or claim points for cards in hand (discarded)
  const playersWithCards = game.players.filter(p => !game.playersOut.includes(p.id));
  
  // Tailender: as soon as only one player has cards left, round ends. Resolve current trick (if any) to whoever is winning; P4's hand is discarded (not counted).
  if (playersWithCards.length === 1) {
    const lastPlayer = playersWithCards[0];
    // Resolve in-progress trick so points go to current winner (one of P1/P2/P3), not lost
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
    if (!game.playersOut.includes(lastPlayer.id)) {
      game.playersOut.push(lastPlayer.id);
    }
    // P4's remaining hand is discarded (not added to stack, not counted for points)
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

  function updatePlayerStatsForRoundEnd(game) {
    if (!game.playerStats || !game.playersOut || game.playersOut.length !== 4) return;
    for (const player of game.players) {
      const stack = game.playerStacks[player.id];
      if (stack && game.playerStats[player.id]) {
        game.playerStats[player.id].points = (game.playerStats[player.id].points || 0) + (stack.points || 0);
      }
    }
    const firstId = game.playersOut[0];
    const lastId = game.playersOut[3];
    if (game.playerStats[firstId]) game.playerStats[firstId].firstPlace = (game.playerStats[firstId].firstPlace || 0) + 1;
    if (game.playerStats[lastId]) game.playerStats[lastId].lastPlace = (game.playerStats[lastId].lastPlace || 0) + 1;

    // Tichu / Grand Tichu: record call and whether they got first (win)
    for (const [pid, declared] of Object.entries(game.tichuDeclarations || {})) {
      if (declared && game.playerStats[pid]) {
        game.playerStats[pid].tichuCalls = (game.playerStats[pid].tichuCalls || 0) + 1;
        if (String(pid) === String(firstId)) game.playerStats[pid].tichuWins = (game.playerStats[pid].tichuWins || 0) + 1;
      }
    }
    for (const [pid, declared] of Object.entries(game.grandTichuDeclarations || {})) {
      if (declared && game.playerStats[pid]) {
        game.playerStats[pid].grandCalls = (game.playerStats[pid].grandCalls || 0) + 1;
        if (String(pid) === String(firstId)) game.playerStats[pid].grandWins = (game.playerStats[pid].grandWins || 0) + 1;
      }
    }
  }
  
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

  updatePlayerStatsForRoundEnd(game);
  
  // Calculate team scores from player stacks
  game.roundScores = { team1: 0, team2: 0 };
  for (const player of game.players) {
    const stack = game.playerStacks[player.id];
    if (stack) {
      game.roundScores[`team${player.team}`] += stack.points;
    }
  }
  
  // Apply Tichu/Grand Tichu: +100/+200 only if player got FIRST; otherwise -100/-200 (BUGS.md: can get negative points)
  const firstPlaceId = game.playersOut && game.playersOut[0] != null ? String(game.playersOut[0]) : null;
  const tichuDeclarations = game.tichuDeclarations || {};
  const grandTichuDeclarations = game.grandTichuDeclarations || {};
  for (const player of game.players) {
    const pid = player.id != null ? String(player.id) : null;
    const gotFirst = firstPlaceId !== null && pid !== null && firstPlaceId === pid;
    if (tichuDeclarations[player.id]) {
      game.roundScores[`team${player.team}`] += gotFirst ? 100 : -100;
    }
    if (grandTichuDeclarations[player.id]) {
      game.roundScores[`team${player.team}`] += gotFirst ? 200 : -200;
    }
  }
  
  // Update total scores (guard for test games that may not have scores)
  if (game.scores) {
    game.scores.team1 = (game.scores.team1 || 0) + game.roundScores.team1;
    game.scores.team2 = (game.scores.team2 || 0) + game.roundScores.team2;
  }
  
appendRoundToLog(game);
  if (game.scores && (game.scores.team1 >= WINNING_SCORE || game.scores.team2 >= WINNING_SCORE)) {
    game.state = 'finished';
    // If both hit 1000 in same round, team with more points wins; else first to 1000 wins
    game.winner = game.scores.team1 >= game.scores.team2 ? 1 : 2;
  } else {
    initializeGame(game);
  }

  return { success: true, game, playerWon: true, roundEnded: true };
}

module.exports = {
  handlePlayerWin,
  buildRoundLogEntry,
  appendRoundToLog
};
