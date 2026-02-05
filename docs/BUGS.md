Current Bug List
****
--(Dont worry about this too much for now) I dont know if its just a bug with moh jong but when i am doing the moh jong glitch(Purposely not playing it to test if it works) then the order of whos playing gets messed up


--[FIXED] Rotation of the game is still not functioning propery. Ending the trick even when each player has not passed.
  Fix: When a pass causes us to cycle back to the lead, we now end the trick immediately (call winTrick) instead of giving the lead another turn.

--[FIXED] Round should end when a team finishes first and second(counts as +200 and do not pass out any game points only add on the tichu points if anyone called)
  Fix: Double victory now triggers as soon as 2nd player goes out (same team), even if their play is still in currentTrick; current trick is cleared without assigning points; +200 and Tichu only.

--[FIXED] Game should end when 3 of the 4 players have finished their hand, this currently doesnt work right now.
  Fix: When 3 are out (playersWithCards.length === 1), round ends: current trick is assigned to current winner if any, then last player is added to playersOut and round is finalized.

To confirm these fixes: run automated tests:
  npm test -- tests/integration/bugFixes.test.js

--If all players have passed the points should be distributed and the next round should start

rule book:
https://cdn.1j1ju.com/medias/f4/75/98-tichu-rulebook.pdf


