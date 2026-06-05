***Next things i want to work on, if i'd like ***
-Some form of notice when a play calls tichu/grand(animated or some notice)
-make the text under "tichu" actually mean something i guess with more information?
-fix the "copy link to join game" currently takes the player to the lobby, but kicks out the other player.


***Fix these in the rules***

-Fix trick and trun flow steps


*Road Map after i get mobile working*:
*Others to work on eventually*

2. Cards
Card visuals
Right now cards are rank + suit only. Consider:
Option A: Keep CSS but improve design (corners, subtle borders, clearer typography, distinct special-card styling for Mah Jong, Phoenix, Dragon, Dog).
Option B: Use card images (e.g. standard deck + custom art for specials) for a more "real deck" feel.
Hand layout
-Make the hand feel like a hand: slight fan or arc, and/or a small overlap so cards don't look like a flat list. Selection can "lift" the card out of the fan.
Playing a card
-When the user plays, animate the selected card(s) from hand → center (e.g. short move + scale), instead of them disappearing and reappearing in the trick. Same idea when opponents play: cards animate from their area into the center.
Trick layout
-Show the current trick as cards in the center of the table (e.g. in a small pile or by position per player), not as a vertical list. Optionally show who led and who followed.
-Do i want to change the look of passing dragon
-Player card count a bit too small

3. Feedback & timing
Sound (optional but high impact)
Card play (place / slide).
Pass.
Trick won (short "trick complete" sound).
Round/game end (win/lose).
Optional: subtle background ambience.
Keep volume low and add a mute toggle.
Short delays
After an action (play, pass, bomb), add a brief delay (e.g. 300–600 ms) before the next turn so the board doesn't change instantly. Use this time for the play animation and, if you add it, sound.
Trick resolution
When a trick is won:
Briefly highlight the winning play or player.
Animate won cards moving to that player's stack (or a "won" pile) before clearing the center.
Then show "Trick won by [Name]" and update scores.
This makes the trick feel like a real round that "resolves" before the next one.
Phase transitions
For Grand Tichu → Exchange → Playing (and round end), use short messages or overlays ("Exchanging cards…", "New round") so phases don't feel abrupt.


















very future updates:

2. Cards
Card visuals
Right now cards are rank + suit only. Consider:
Option A: Keep CSS but improve design (corners, subtle borders, clearer typography, distinct special-card styling for Mah Jong, Phoenix, Dragon, Dog).
Option B: Use card images (e.g. standard deck + custom art for specials) for a more "real deck" feel.
Hand layout
Make the hand feel like a hand: slight fan or arc, and/or a small overlap so cards don't look like a flat list. Selection can "lift" the card out of the fan.
Playing a card
When the user plays, animate the selected card(s) from hand → center (e.g. short move + scale), instead of them disappearing and reappearing in the trick. Same idea when opponents play: cards animate from their area into the center.
Trick layout
Show the current trick as cards in the center of the table (e.g. in a small pile or by position per player), not as a vertical list. Optionally show who led and who followed.


3. Feedback & timing
Sound (optional but high impact)
Card play (place / slide).
Pass.
Trick won (short "trick complete" sound).
Round/game end (win/lose).
Optional: subtle background ambience.
Keep volume low and add a mute toggle.
Short delays
After an action (play, pass, bomb), add a brief delay (e.g. 300–600 ms) before the next turn so the board doesn't change instantly. Use this time for the play animation and, if you add it, sound.
Trick resolution
When a trick is won:
Briefly highlight the winning play or player.
Animate won cards moving to that player's stack (or a "won" pile) before clearing the center.
Then show "Trick won by [Name]" and update scores.
This makes the trick feel like a real round that "resolves" before the next one.
Phase transitions
For Grand Tichu → Exchange → Playing (and round end), use short messages or overlays ("Exchanging cards…", "New round") so phases don't feel abrupt.
