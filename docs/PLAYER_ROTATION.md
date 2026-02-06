# Player Rotation Logic

This document describes how turn order, lead player, and “next player” are determined so you can verify the implementation is correct.

---

## 1. State that drives rotation

| Field | Meaning |
|-------|--------|
| `game.turnOrder` | Array of `{ id, team, name }` in **seat order**. Used for “next player” and “wrap back to lead”. |
| `game.currentPlayerIndex` | Index into `turnOrder` for **whose turn it is**. Only this player may act (except bombs). |
| `game.leadPlayer` | Player who **must play** this trick (started the trick, or won last trick, or bomb player, or Dog recipient). Lead cannot pass. |
| `game.currentTrick` | Array of `{ playerId, cards, combination }` for the current trick. |
| `game.passedPlayers` | IDs of players who **passed this trick**. Cleared when anyone plays. |
| `game.playersOut` | IDs of players who have **gone out** (empty hand). |
| `game.hands[playerId]` | Current hand. Empty ⇒ treated as out. |
| `game.dogPriorityPlayer` | If set, this player has **Dog priority** and must play (cannot pass). |

**Who can act:** The player at `turnOrder[currentPlayerIndex]` is the only one who may play or pass, **except** bombs can be played out of turn by anyone (when allowed).

---

## 2. Core rule: “Next” and “trick end”

Within a trick we advance to the **next player in turn order** who:

- has **not** already acted this trick (not in `passedPlayers`, not in `currentTrick`),
- has cards (`hands[id].length > 0`),
- is not in `playersOut`.

We advance one-by-one in `turnOrder`. If we **wrap back to the lead** (i.e. the “next” we would give the turn to is the lead), we **do not** give the lead another turn. Instead we **end the trick**: call `winTrick(game, winnerId)`, then `startNewTrick` runs inside `winTrick`. So rotation never gives the lead a second turn in the same trick.

---

## 3. Pass (action === 'pass')

**Location:** `moveHandler.js` (pass branch).

1. **Checks:** Current player’s turn; not lead; not Dog priority; trick not empty; Mah Jong wish rules.
2. **Effect:** `passedPlayers.push(playerId)`.
3. **Next player:** Start from `(currentPlayerIndex + 1) % turnOrder.length`, then advance until we find a player who:
   - is not out and has cards,
   - has **not** acted (not in `passedPlayers`, not in `currentTrick`).
4. **Trick end:** If that “next” is the **lead** → everyone has acted → call `winTrick(game, winnerId)` (winner = current winning play or lead) and return with `newTrick: true`. **Do not** set current player to lead.
5. **Else:** `currentPlayerIndex = nextPlayerIndex` and return.

So after a pass we never give the lead another turn; we end the trick instead.

---

## 4. Play (normal, not bomb, not Dog)

**Location:** `moveHandler.js` (play path after adding to `currentTrick`).

1. **Add play:** `currentTrick.push({ playerId, cards, combination })`.
2. **Clear passes:** `passedPlayers = []` (a new play resets passes).
3. **If player went out (`hand.length === 0`) and not Dog:**
   - **If** “all others had already passed” (`passedPlayers.length === players.length - 1`) and not Dragon single:  
     Call `winTrick(game, playerId)` then `handlePlayerWin(game, playerId)` and return (trick ends, round may end).
   - **Else:** Call `handlePlayerWin(game, playerId)`. If `!game.roundEnded`, find next player who hasn’t played in this trick and has cards (same loop as below). If that next is the lead → call `winTrick`, then return with `newTrick: true`. Else set `currentPlayerIndex = next` and return.
4. **If Dog was played:** Do **not** advance; `handleSpecialCards` already set `leadPlayer` and `currentPlayerIndex` to the partner (or next with cards). Return.
5. **Else (normal play, didn’t go out):** Find next in turn order who hasn’t played in this trick and has cards. If that next is the **lead** → call `winTrick(game, winnerId)` and return with `newTrick: true`. Else set `currentPlayerIndex = next` and return.

So after a normal play we either advance to the next non-acting player with cards or end the trick when we would wrap to the lead.

---

## 5. Bomb

**Location:** `moveHandler.js` (bomb branch).

1. **Lead and turn order:**  
   `leadPlayer = playerId` (bomb player).  
   Rotate `turnOrder` so the bomb player is at index 0:  
   `turnOrder = [ ...turnOrder.slice(bombPlayerIndex), ...turnOrder.slice(0, bombPlayerIndex) ]`.  
   `currentPlayerIndex = 0`.
2. **Clear:** `passedPlayers = []`.
3. **Next player:** Start from index **1** (next after bomb player). Same rule: first player who has cards and has not played in this trick. If we wrap back to index 0 (lead) → bomb wins: `winTrick(game, bombPlayerId)`, return with `newTrick: true`, `winner: bomb player`. Else `currentPlayerIndex = nextPlayerIndex`.
4. **If bomb player went out:** Same “find next” logic; if wrap to lead, `winTrick` then return.

So after a bomb, the bomb player is lead and at index 0; we only give the turn to someone else (index ≥ 1) or end the trick and give the next trick to the bomb player via `winTrick` → `startNewTrick`.

---

## 6. Dog (lead card only)

**Location:** `specialCards.js` → `handleSpecialCards`; `moveHandler` does not advance when Dog was played.

1. **Who gets priority:** Partner (same team, different id). If partner has no cards or is out, use `getNextPlayerWithCards(game, partner.id)`.
2. **Set:** `leadPlayer = nextLeadPlayer.id`, `dogPriorityPlayer = nextLeadPlayer.id`, `currentPlayerIndex = nextLeadPlayer`’s index in `turnOrder`.
3. **moveHandler:** After adding the Dog play to the trick, if `dogWasPlayed` we **do not** run the “find next player” logic; the special-card handler already set the turn.

So Dog forces the **partner** (or next player with cards) to be lead and current player; they must play.

---

## 7. Winning a trick and starting the next one

**winTrick(game, winnerId)** — `trickManager.js`:

- Assign trick cards/points to winner (or Dragon opponent selection).
- Push trick to `trickHistory`.
- Set **`game.leadPlayer = winnerId`**.
- Clear `currentTrick`, `passedPlayers`; clear Dragon state if not in Dragon selection.
- Call **`startNewTrick(game)`**.

**startNewTrick(game)** — `trickManager.js`:

- `currentTrick = []`, `passedPlayers = []`, `dogPriorityPlayer = null`.
- Find `leadPlayer` in `turnOrder`:
  - If lead **has cards** and is **not** in `playersOut`: set `currentPlayerIndex = leadPlayerIndex` (winner plays first).
  - Else: **lead has no cards or is out** → `next = getNextPlayerWithCards(game, leadPlayerId)`, then set `leadPlayer = next.id` and `currentPlayerIndex = next`’s index. So the **next player with cards** becomes lead and current player.
- If lead not found in `turnOrder`: find any player with cards and set them as lead and current.

So when the trick winner has no cards (e.g. went out on the winning play), the **next player with cards** gets the lead and the turn, not the winner.

---

## 8. getNextPlayerWithCards(game, startPlayerId)

**Location:** `turnManagement.js`.

- Start from `startPlayerId` in `turnOrder`, then step through in order (wrapping).
- Return the **first** player for whom `game.hands[playerId].length > 0`.
- Used when the trick winner has gone out (in `startNewTrick`) and when Dog’s partner is out (in `specialCards.js`).

So “next with cards” is always in **seat order** from the given start.

---

## 9. advanceTurn (turnManagement.js)

- `currentPlayerIndex = (currentPlayerIndex + 1) % turnOrder.length`, then skip anyone who has **passed** or has **no cards** until we find someone who can act.
- **Not used** in the main pass/play paths in `moveHandler.js` (see comment there: we need to give every player a turn in the trick, so we use custom “find next who hasn’t acted” loops instead of `advanceTurn`, which would skip passed players).  
- Used in tests and possibly other edge flows. The main rotation is the explicit “find next / wrap to lead → end trick” logic above.

---

## 10. Summary checklist

- **Pass:** Advance to next who hasn’t acted; if that’s the lead → end trick (no second turn for lead).
- **Play:** Clear passes, add play; if went out handle that then same “next or end trick”; else find next who hasn’t played or end trick when we wrap to lead.
- **Bomb:** Bomb player becomes lead and index 0; find next from index 1 or end trick with bomb player as winner.
- **Dog:** Partner (or next with cards) becomes lead and current player; moveHandler does not advance.
- **winTrick:** Sets `leadPlayer = winnerId`, then `startNewTrick`.
- **startNewTrick:** If winner has no cards, lead and turn go to `getNextPlayerWithCards(winnerId)`.

This keeps a single consistent rule: **within a trick we never give the lead a second turn; we end the trick and the winner (or next with cards) leads the next one.**
