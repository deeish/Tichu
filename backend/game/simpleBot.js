/**
 * Bot logic for single-player ("Play vs Bots") games.
 * Drives the 3 AI opponents: leading multi-card combos, beating tricks, breaking
 * with bombs, declaring Tichu/Grand Tichu, and exchanging cards strategically.
 * Every "must act" path (lead, dog priority, wished card) returns a valid move so
 * the server turn loop never stalls.
 */

const { validateCombination, compareCombinations } = require('./combinations');
const { getCurrentWinningPlay } = require('./trickManager');
const { getCardValue, getCardPoints } = require('./deck');
const { getExchangeRecipients } = require('./exchange');

// Sort value used for bot ranking (NOT game scoring). Phoenix/Dragon kept high so
// they are never treated as "low" cards to dump.
function cardSortValue(card) {
  if (!card) return 0;
  if (card.type === 'standard') return getCardValue(card.rank);
  const specials = { mahjong: 1, dog: 0, phoenix: 15, dragon: 16 };
  return specials[card.name] || 0;
}

function isPremiumCard(card) {
  if (!card) return false;
  if (card.type === 'special') return card.name === 'dragon' || card.name === 'phoenix' || card.name === 'mahjong';
  return card.rank === 'A' || card.rank === 'K';
}

function rankGroups(hand) {
  const groups = {};
  for (const c of hand) {
    if (c && c.type === 'standard') {
      (groups[c.rank] || (groups[c.rank] = [])).push(c);
    }
  }
  return groups;
}

function wrap(cards) {
  return { cards, validation: validateCombination(cards) };
}

function findPairs(hand) {
  const groups = rankGroups(hand);
  const phoenix = hand.find((c) => c.name === 'phoenix');
  const res = [];
  for (const rank in groups) {
    const g = groups[rank];
    if (g.length >= 2) res.push([g[0], g[1]]);
    else if (phoenix) res.push([g[0], phoenix]);
  }
  return res.map(wrap).filter((x) => x.validation.valid && x.validation.type === 'pair');
}

function findTriples(hand) {
  const groups = rankGroups(hand);
  const phoenix = hand.find((c) => c.name === 'phoenix');
  const res = [];
  for (const rank in groups) {
    const g = groups[rank];
    if (g.length >= 3) res.push([g[0], g[1], g[2]]);
    if (g.length >= 2 && phoenix) res.push([g[0], g[1], phoenix]);
  }
  return res.map(wrap).filter((x) => x.validation.valid && x.validation.type === 'triple');
}

function findFullHouses(hand) {
  const triples = findTriples(hand);
  const pairs = findPairs(hand);
  const res = [];
  for (const t of triples) {
    const used = new Set(t.cards);
    for (const p of pairs) {
      if (p.cards.some((c) => used.has(c))) continue;
      const combo = wrap([...t.cards, ...p.cards]);
      if (combo.validation.valid && combo.validation.type === 'fullhouse') res.push(combo);
    }
  }
  return res;
}

// Consecutive sub-runs (length >= minLen) from a sorted list of {value, card} entries.
function consecutiveRuns(entries, minLen, perStep) {
  const res = [];
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1].value === entries[j].value + 1) j++;
    if (j - i + 1 >= minLen) {
      for (let start = i; start <= j; start++) {
        for (let end = start + minLen - 1; end <= j; end++) {
          const cards = [];
          for (let k = start; k <= end; k++) perStep(entries[k], cards);
          res.push(cards);
        }
      }
    }
    i = j + 1;
  }
  return res;
}

function findStraights(hand) {
  const byValue = {};
  for (const c of hand) {
    if (c.type === 'standard') {
      const v = getCardValue(c.rank);
      if (byValue[v] === undefined) byValue[v] = c;
    } else if (c.name === 'mahjong') {
      if (byValue[1] === undefined) byValue[1] = c;
    }
  }
  const entries = Object.keys(byValue)
    .map((v) => ({ value: Number(v), card: byValue[v] }))
    .sort((a, b) => a.value - b.value);
  const raw = consecutiveRuns(entries, 5, (e, cards) => cards.push(e.card));
  // Exclude accidental straight flushes (they validate as bombs) so we never "lead" a bomb.
  return raw.map(wrap).filter((x) => x.validation.valid && x.validation.type === 'straight');
}

function findSequenceOfPairs(hand) {
  const groups = rankGroups(hand);
  const entries = Object.keys(groups)
    .filter((r) => groups[r].length >= 2)
    .map((r) => ({ value: getCardValue(r), rank: r }))
    .sort((a, b) => a.value - b.value);
  const raw = consecutiveRuns(entries, 2, (e, cards) => {
    cards.push(groups[e.rank][0], groups[e.rank][1]);
  });
  return raw.map(wrap).filter((x) => x.validation.valid && x.validation.type === 'sequence-of-pairs');
}

function findBombs(hand) {
  const res = [];
  const groups = rankGroups(hand);
  for (const rank in groups) {
    if (groups[rank].length >= 4) res.push(groups[rank].slice(0, 4));
  }
  // Straight flushes: same suit, consecutive, length >= 5
  const bySuit = {};
  for (const c of hand) {
    if (c.type === 'standard') (bySuit[c.suit] || (bySuit[c.suit] = [])).push(c);
  }
  for (const suit in bySuit) {
    const byValue = {};
    for (const c of bySuit[suit]) {
      const v = getCardValue(c.rank);
      if (byValue[v] === undefined) byValue[v] = c;
    }
    const entries = Object.keys(byValue)
      .map((v) => ({ value: Number(v), card: byValue[v] }))
      .sort((a, b) => a.value - b.value);
    consecutiveRuns(entries, 5, (e, cards) => cards.push(e.card)).forEach((cards) => res.push(cards));
  }
  return res.map(wrap).filter((x) => x.validation.valid && x.validation.type === 'bomb');
}

function comboTopValue(cards) {
  return Math.max(...cards.map(cardSortValue));
}

// Lowest combo of the same type that beats the winning combo, or null.
function findBeatingCombo(hand, winningCombo) {
  let candidates;
  switch (winningCombo.type) {
    case 'single':
      candidates = hand.map((c) => wrap([c])).filter((x) => x.validation.valid && x.validation.type === 'single');
      break;
    case 'pair':
      candidates = findPairs(hand);
      break;
    case 'triple':
      candidates = findTriples(hand);
      break;
    case 'fullhouse':
      candidates = findFullHouses(hand);
      break;
    case 'straight':
      candidates = findStraights(hand).filter((x) => x.validation.length === winningCombo.length);
      break;
    case 'sequence-of-pairs':
      candidates = findSequenceOfPairs(hand).filter((x) => x.validation.numPairs === winningCombo.numPairs);
      break;
    default:
      candidates = [];
  }
  const beating = candidates.filter((x) => compareCombinations(x.validation, winningCombo) === 1);
  if (!beating.length) return null;
  beating.sort((a, b) => compareCombinations(a.validation, b.validation) || 0);
  return beating[0];
}

// Lowest bomb that beats the winning combo (any bomb beats a non-bomb), or null.
function findBeatingBomb(hand, winningCombo) {
  const bombs = findBombs(hand);
  const beating = bombs.filter((b) => compareCombinations(b.validation, winningCombo) === 1);
  if (!beating.length) return null;
  beating.sort((a, b) => compareCombinations(a.validation, b.validation) || 0);
  return beating[0];
}

function getMahJongWish(hand) {
  const present = new Set(hand.filter((c) => c.type === 'standard').map((c) => c.rank));
  for (const r of ['A', 'K', 'Q', 'J', '10']) {
    if (!present.has(r)) return r;
  }
  return 'A';
}

function lowestSingleLead(hand, isFirstTrick) {
  const standard = hand.filter((c) => c.type === 'standard');
  const pool = standard.length ? standard : hand;
  const sorted = [...pool].sort((a, b) => cardSortValue(a) - cardSortValue(b));
  for (const card of sorted) {
    if (isFirstTrick && card.name === 'mahjong') continue;
    if (validateCombination([card]).valid) {
      const wish = card.name === 'mahjong' ? getMahJongWish(hand) : null;
      return { cards: [card], action: 'play', mahJongWish: wish };
    }
  }
  // Absolute fallback (e.g. only Mah Jong left): play first card.
  const card = sorted[0] || hand[0];
  return { cards: [card], action: 'play', mahJongWish: card.name === 'mahjong' ? getMahJongWish(hand) : null };
}

/**
 * Returns a valid move { cards, action, mahJongWish } or { action: 'pass' }.
 * Returns null only when it is not this player's turn / nothing to do.
 */
function getBotMove(game, playerId) {
  const hand = game.hands && game.hands[playerId];
  if (!hand || hand.length === 0) return null;

  const currentPlayer = game.turnOrder && game.turnOrder[game.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return null;
  if (game.dragonOpponentSelection) return null; // handled by the server separately

  const trickEmpty = !game.currentTrick || game.currentTrick.length === 0;

  // ---- LEAD ----
  if (trickEmpty) {
    const isFirstTrick = trickEmpty; // empty trick at lead time

    // Mah Jong holder must lead it on the very first trick of the round.
    const mustPlayMahJong = !game.mahJongPlayed && game.leadPlayer === playerId && hand.some((c) => c.name === 'mahjong');
    if (mustPlayMahJong) {
      const mahjong = hand.find((c) => c.name === 'mahjong');
      if (validateCombination([mahjong]).valid) {
        return { cards: [mahjong], action: 'play', mahJongWish: getMahJongWish(hand) };
      }
    }

    // Must satisfy an active wish when leading and holding the wished rank.
    const wishedRank = game.mahJongWish && game.mahJongWish.wishedRank;
    if (game.mahJongWish && game.mahJongWish.mustPlay && wishedRank) {
      const wishedCard = hand.find((c) => c.type === 'standard' && c.rank === wishedRank);
      if (wishedCard && validateCombination([wishedCard]).valid) {
        return { cards: [wishedCard], action: 'play', mahJongWish: null };
      }
    }

    // Prefer shedding a multi-card combo (longest first, then lowest), never a bomb
    // or a Phoenix (kept for beating / wild use).
    const leadCombos = [
      ...findStraights(hand),
      ...findSequenceOfPairs(hand),
      ...findFullHouses(hand),
      ...findTriples(hand),
      ...findPairs(hand),
    ].filter((c) => !c.cards.some((card) => card.name === 'phoenix'));

    if (leadCombos.length) {
      leadCombos.sort((a, b) => b.cards.length - a.cards.length || comboTopValue(a.cards) - comboTopValue(b.cards));
      return { cards: leadCombos[0].cards, action: 'play', mahJongWish: null };
    }

    return lowestSingleLead(hand, isFirstTrick);
  }

  // ---- FOLLOW ----
  const myPlayer = game.players && game.players.find((p) => p.id === playerId);
  const winningPlay = getCurrentWinningPlay(game.currentTrick);

  // Dog-only trick: no combination to beat. Dog-priority player must play.
  if (!winningPlay) {
    if (game.currentTrick.length > 0 && game.dogPriorityPlayer === playerId) {
      const single = lowestSingleLead(hand, false);
      if (single) return single;
    }
    return { action: 'pass' };
  }

  const combo = winningPlay.combination;
  if (!combo) return { action: 'pass' };

  // Must play the wished single if we hold it and it beats (server enforces this).
  if (game.mahJongWish && game.mahJongWish.mustPlay && game.mahJongWish.wishedRank && combo.type === 'single') {
    const wishedCard = hand.find((c) => c.type === 'standard' && c.rank === game.mahJongWish.wishedRank);
    if (wishedCard) {
      const v = validateCombination([wishedCard]);
      if (v.valid && compareCombinations(v, combo) === 1) {
        return { cards: [wishedCard], action: 'play', mahJongWish: null };
      }
    }
  }

  // Normal beat: lowest same-type combo that beats.
  const beat = findBeatingCombo(hand, combo);
  if (beat) return { cards: beat.cards, action: 'play', mahJongWish: null };

  // Can't beat normally — consider a bomb if an opponent holds a valuable trick.
  const winner = game.players && game.players.find((p) => p.id === winningPlay.playerId);
  const opponentWinning = winner && myPlayer && winner.team !== myPlayer.team;
  const trickPoints = (game.currentTrick || []).reduce(
    (sum, play) => sum + (play.cards || []).reduce((s, c) => s + getCardPoints(c), 0),
    0
  );
  if (opponentWinning && (trickPoints >= 10 || combo.type === 'bomb')) {
    const bomb = findBeatingBomb(hand, combo);
    if (bomb) return { cards: bomb.cards, action: 'play', mahJongWish: null };
  }

  return { action: 'pass' };
}

/**
 * Picks an opponent for Dragon (never the partner). Used when a bot wins with Dragon.
 */
function getDragonOpponentChoice(game, dragonPlayerId) {
  const dragonPlayer = game.players.find((p) => p.id === dragonPlayerId);
  if (!dragonPlayer) return null;
  const opponents = game.players.filter((p) => p.id !== dragonPlayerId && p.team !== dragonPlayer.team);
  if (opponents.length === 0) return null;
  return opponents[Math.floor(Math.random() * opponents.length)].id;
}

// Hand-strength score shared by both declaration heuristics.
function handStrengthScore(hand) {
  let score = 0;
  for (const c of hand) {
    if (c.name === 'dragon') score += 3;
    else if (c.name === 'phoenix') score += 2;
    else if (c.rank === 'A') score += 2;
    else if (c.rank === 'K') score += 1;
  }
  return score;
}

/**
 * Conservative: declare Grand Tichu only on a very strong initial 8-card hand.
 */
function shouldDeclareGrandTichu(hand) {
  if (!Array.isArray(hand)) return false;
  return handStrengthScore(hand) >= 6;
}

/**
 * Conservative: declare Tichu on a strong full 14-card hand (incl. a bomb).
 */
function shouldDeclareTichu(hand) {
  if (!Array.isArray(hand)) return false;
  let score = handStrengthScore(hand);
  if (findBombs(hand).length > 0) score += 4;
  return score >= 8;
}

/**
 * Chooses 3 cards to pass, ordered to match getExchangeRecipients (card[i] -> recipient[i]).
 * Gives the 2 weakest cards to opponents and a modest card to the partner; never gives
 * away Aces/Kings/Dragon/Phoenix/Mah Jong unless forced.
 */
function getBotExchange(game, playerId) {
  const hand = game.hands[playerId] || [];
  const recipients = getExchangeRecipients(game, playerId);
  if (recipients.length !== 3 || hand.length < 3) {
    return hand.slice(0, 3);
  }

  const byStrength = [...hand].sort((a, b) => cardSortValue(a) - cardSortValue(b));
  const giveable = byStrength.filter((c) => !isPremiumCard(c));
  let chosen = giveable.slice(0, 3);
  if (chosen.length < 3) {
    const rest = byStrength.filter((c) => !chosen.includes(c));
    chosen = chosen.concat(rest).slice(0, 3);
  }
  // chosen is ascending by strength: [weakest, mid, strongest-of-the-three]
  chosen.sort((a, b) => cardSortValue(a) - cardSortValue(b));
  const partnerCard = chosen[chosen.length - 1];
  const opponentCards = chosen.slice(0, chosen.length - 1);

  const result = [];
  let oppIdx = 0;
  for (let i = 0; i < 3; i++) {
    result[i] = recipients[i].isPartner ? partnerCard : opponentCards[oppIdx++];
  }
  return result;
}

module.exports = {
  getBotMove,
  getDragonOpponentChoice,
  shouldDeclareGrandTichu,
  shouldDeclareTichu,
  getBotExchange,
  findBombs,
};
