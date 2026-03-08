Current Bug List
****
new bugs
**If we bomb a dragon that user gets it**
**When players disconnect make sure they get their team status still(users left, 1 & 3 finished first and round didnt end even though they were on a team)**
**when players leave make sure their names stays the same**
**hen call grand, dont let user clikc on tichu(it currently still glows)**
**Sometimes when a team finishes the round doesnt end**

**Why single bugs can break the game + defensive measures:** See **docs/DEFENSIVE_GAME_STATE.md** (normalize state, no auto-resync on trick-won to avoid overwriting lead play, "Resync" in sidebar and error fallback).

Check the logic for these:
-Most gameplay bugs have been cleared but check for edgecases, especially with bombs
-did some testing with points but double check that its fully functional

-**Points are not Aggregating correctly right now.**



rule book:
https://cdn.1j1ju.com/medias/f4/75/98-tichu-rulebook.pdf


