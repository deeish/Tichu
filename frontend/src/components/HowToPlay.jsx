import { useNavigate } from 'react-router-dom'
import './HowToPlay.css'

function HowToPlay() {
  const navigate = useNavigate()
  const goBack = () => navigate('/')

  const toc = [
    { id: 'quickstart', label: 'Play in 60 seconds' },
    { id: 'goal', label: 'Goal & teams' },
    { id: 'setup', label: 'Setup & deal' },
    { id: 'passing', label: 'Passing 3 cards' },
    { id: 'tichu', label: 'Calling Tichu' },
    { id: 'turn', label: 'Turn & trick flow' },
    { id: 'combos', label: 'Legal combinations' },
    { id: 'specials', label: 'Special cards' },
    { id: 'bombs', label: 'Bombs' },
    { id: 'end', label: 'End of round' },
    { id: 'scoring', label: 'Scoring' },
    { id: 'endgame', label: 'End of game' },
    { id: 'faq', label: 'FAQ' },
  ]

  return (
    <div className="how-to-play how-to-play-page">
      <div className="how-to-play-panel htp-panel" role="main" aria-labelledby="how-to-play-title">
        <header className="how-to-play-header htp-header">
          <div className="htp-header-left">
            <h1 id="how-to-play-title" className="how-to-play-title htp-title">
              How to play Tichu
            </h1>
            <p className="htp-subtitle">Learn in order, then use this page as a quick reference mid‑game.</p>
          </div>

          <button
            type="button"
            className="how-to-play-close htp-close"
            onClick={goBack}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </header>

        <div className="how-to-play-body htp-body">
          {/* Mobile: quick nav */}
          <div className="htp-mobile-top">
            <details className="htp-details htp-mobile-details">
              <summary className="htp-details-summary">Jump to a section</summary>
              <nav aria-label="Table of contents">
                <ol className="htp-toc-list">
                  {toc.map((item) => (
                    <li key={item.id} className="htp-toc-item">
                      <a className="htp-toc-link" href={`#${item.id}`}>
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </details>

            <details className="htp-details htp-mobile-details">
              <summary className="htp-details-summary">Quick reference</summary>
              <div className="htp-cheat-inner">
                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Points</div>
                  <ul className="htp-bullets">
                    <li>5 = +5</li>
                    <li>10 &amp; K = +10 each</li>
                    <li>Dragon = +25</li>
                    <li>Phoenix = −25</li>
                  </ul>
                </div>

                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Opening hand</div>
                  <p className="htp-muted">
                    If you hold <strong>Mah Jong</strong>, it must be the first play (single or in a straight containing 1), then
                    announce a wish.
                  </p>
                </div>

                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Trick ends</div>
                  <p className="htp-muted">When 3 players pass in order, the last play wins and leads next.</p>
                </div>
              </div>
            </details>
          </div>

          <div className="htp-layout">
            {/* Desktop TOC */}
            <aside className="htp-toc" aria-label="Table of contents">
              <div className="htp-toc-head">
                <div className="htp-toc-title">Jump to</div>
                <div className="htp-toc-hint">Tip: use Ctrl/⌘+F to find a rule fast.</div>
              </div>

              <ol className="htp-toc-list">
                {toc.map((item) => (
                  <li key={item.id} className="htp-toc-item">
                    <a className="htp-toc-link" href={`#${item.id}`}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </aside>

            {/* Main content */}
            <article className="htp-content">
              <section id="quickstart" className="htp-section">
                <div className="htp-section-head">
                  <h2 className="htp-h2">Play in 60 seconds</h2>
                  <div className="htp-chip">Quick Start</div>
                </div>

                <ol className="htp-steps">
                  <li>
                    <strong>Teams:</strong> you play with a partner sitting across from you.
                  </li>
                  <li>
                    <strong>Goal:</strong> be the first team to reach <strong>1000</strong> points (checked at the end of a round).
                  </li>
                  <li>
                    <strong>Deal:</strong> each player gets <strong>14</strong> cards.
                  </li>
                  <li>
                    <strong>Grand Tichu (optional):</strong> must be called early (before taking your 9th card at the start).
                  </li>
                  <li>
                    <strong>Pass:</strong> everyone passes <strong>3</strong> cards, one to each other player.
                  </li>
                  <li>
                    <strong>Opening:</strong> if you hold <strong>Mah Jong</strong>, you must play it first (single or in a
                    straight containing 1), then announce a wish.
                  </li>
                  <li>
                    <strong>On your turn:</strong> either play a higher <em>same‑type</em> combination, or pass. (Bombs can interrupt.)
                  </li>
                  <li>
                    <strong>Trick ends:</strong> when 3 players pass in order, the last play takes the trick and leads next.
                  </li>
                  <li>
                    <strong>Round ends:</strong> when only one player still has cards. Then score points (or 200 for a double victory).
                  </li>
                </ol>
              </section>

              <section id="goal" className="htp-section">
                <h2 className="htp-h2">Goal &amp; teams</h2>
                <p>
                  Tichu is a partnership trick‑taking game for 4 players. You and the player across from you are a team. The first
                  team to reach <strong>1000</strong> points (at the end of a round) wins.
                </p>
              </section>

              <section id="setup" className="htp-section">
                <h2 className="htp-h2">Setup &amp; deal</h2>
                <ul className="htp-bullets">
                  <li>
                    Use a 56‑card deck: 4 suits × 13 ranks plus 4 special cards (Mah Jong, Phoenix, Dragon, Dog).
                  </li>
                  <li>
                    Each player gets <strong>14</strong> cards.
                  </li>
                  <li>Play proceeds in a fixed turn order.</li>
                </ul>
              </section>

              <section id="passing" className="htp-section">
                <h2 className="htp-h2">Passing 3 cards</h2>
                <p>
                  Before play begins, each player selects <strong>3 cards</strong> and passes <strong>one card to each other player</strong>,
                  face down. After everyone passes, pick up the 3 you received.
                </p>
              </section>

              <section id="tichu" className="htp-section">
                <h2 className="htp-h2">Calling Tichu</h2>

                <div className="htp-rulegrid">
                  <div className="htp-rulebox">
                    <h3 className="htp-h3">Small Tichu</h3>
                    <p className="htp-muted">
                      You may call Small Tichu any time <strong>until you play your first card</strong>.
                    </p>
                    <ul className="htp-bullets">
                      <li>
                        If you empty your hand <strong>first</strong> (play your last card before anyone else), your team gets <strong>+100</strong>.
                      </li>
                      <li>
                        Otherwise your team gets <strong>−100</strong>.
                      </li>
                    </ul>
                  </div>

                  <div className="htp-rulebox">
                    <h3 className="htp-h3">Grand Tichu</h3>
                    <p className="htp-muted">
                      You may call Grand Tichu very early: <strong>before taking your 9th card</strong> at the start.
                    </p>
                    <ul className="htp-bullets">
                      <li>
                        If you empty your hand <strong>first</strong>, your team gets <strong>+200</strong>.
                      </li>
                      <li>
                        Otherwise your team gets <strong>−200</strong>.
                      </li>
                    </ul>
                  </div>
                </div>

                <details className="htp-details">
                  <summary className="htp-details-summary">Rules clarity</summary>
                  <ul className="htp-bullets">
                    <li>Calling Tichu is individual, partners shouldn’t coordinate the call.</li>
                    <li>Calls are often made before passing so that passing can support the call.</li>
                  </ul>
                </details>
              </section>

              <section id="turn" className="htp-section">
                <div className="htp-section-head">
                  <h2 className="htp-h2">Turn &amp; trick flow</h2>
                  <div className="htp-chip">Flow</div>
                </div>

                <div className="htp-split">
                  <div className="htp-split-card">
                    <div className="htp-split-kicker">Opening hand (Trick 1)</div>
                    <h3 className="htp-h3">Open with the Mah Jong</h3>
                    <p className="htp-muted">
                      If you hold the Mah Jong, it must be the first play, either as a <strong>single</strong>{' '}
                      or inside a <strong>straight containing 1</strong> (example: 1‑2‑3‑4‑5). When it’s played, announce a <strong>wish</strong>{' '}
                      for a rank (2–A, no special cards).
                    </p>
                  </div>

                  <div className="htp-split-card">
                    <div className="htp-split-kicker">After that</div>
                    <h3 className="htp-h3">Trick winner leads next</h3>
                    <p className="htp-muted">
                      The player who wins the previous trick leads the next trick and may lead <strong>any legal combination</strong>.
                      (If a wish is active, they must fulfill it if they can legally do so on their turn.)
                    </p>
                  </div>
                </div>

                <div className="htp-flow">
                  <div className="htp-flow-step">
                    <div className="htp-flow-num">1</div>
                    <div>
                      <div className="htp-flow-title">Lead a combination</div>
                      <p className="htp-muted">
                        The leader plays any legal combination. On the opening trick, the Mah Jong holder must open with Mah Jong (see above).
                      </p>
                    </div>
                  </div>

                  <div className="htp-flow-step">
                    <div className="htp-flow-num">2</div>
                    <div>
                      <div className="htp-flow-title">Play higher same‑type or pass</div>
                      <p className="htp-muted">
                        On your turn you either (a) play a <strong>same‑type</strong> combination of higher value, or (b) pass.
                      </p>
                    </div>
                  </div>

                  <div className="htp-flow-step">
                    <div className="htp-flow-num">3</div>
                    <div>
                      <div className="htp-flow-title">Three passes ends the trick</div>
                      <p className="htp-muted">
                        As soon as 3 players pass in order, the last (highest) play wins the trick and that player leads next. The winner collects all cards from that trick into their trick pile (face down).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="htp-callout htp-callout-warn">
                  <div className="htp-callout-title">Key idea</div>
                  <p className="htp-callout-text">
                    You are never forced to play—passing is always allowed. If you choose to play, you must beat the current play
                    with the same type (unless you use a bomb).
                  </p>
                </div>

                <details className="htp-details">
                  <summary className="htp-details-summary">If someone empties their hand mid‑trick</summary>
                  <p className="htp-muted">
                    If the player who would lead next has no cards left, the right to lead passes to the next player in turn order
                    who still has cards.
                  </p>
                </details>

                <details className="htp-details">
                  <summary className="htp-details-summary">Wish rule (short)</summary>
                  <p className="htp-muted">
                    If a wish is active: on your normal turn, if you can legally play the wished rank, you must do so. If you can’t
                    (or it wouldn’t be legal), you may play anything legal or pass.
                  </p>
                </details>
              </section>

              <section id="combos" className="htp-section">
                <h2 className="htp-h2">Legal combinations</h2>
                <p className="htp-muted">
                  You may lead any of these. To beat a play, you must play the <strong>same type</strong> and it must be higher.
                  (Exception: bombs.)
                </p>

                <div className="htp-combolist" role="region" aria-label="Combination list">
                  <div className="htp-combolist-header">
                    <span className="htp-combolist-type">Type</span>
                    <span className="htp-combolist-min">Minimum</span>
                    <span className="htp-combolist-notes">Notes</span>
                  </div>
                  <div className="htp-combolist-row">
                    <span className="htp-combolist-type">Single</span>
                    <span className="htp-combolist-min">1 card</span>
                    <span className="htp-combolist-notes">Higher rank beats lower (special card exceptions apply).</span>
                  </div>
                  <div className="htp-combolist-row">
                    <span className="htp-combolist-type">Pair</span>
                    <span className="htp-combolist-min">2 same rank</span>
                    <span className="htp-combolist-notes">Only a higher pair beats a pair.</span>
                  </div>
                  <div className="htp-combolist-row">
                    <span className="htp-combolist-type">Sequence of pairs (aka Quenchies)</span>
                    <span className="htp-combolist-min">2+ adjacent pairs</span>
                    <div className="htp-combolist-notes">
                      You must match the number of pairs to beat it.
                      <details className="htp-details htp-combo-details">
                        <summary className="htp-details-summary">Example</summary>
                        <p className="htp-muted">
                          If a player plays 2-2-3-3-4-4, you can play 3-3-4-4-5-5 or 4-4-5-5-6-6 (same number of pairs, higher rank).
                        </p>
                      </details>
                    </div>
                  </div>
                  <div className="htp-combolist-row">
                    <span className="htp-combolist-type">Trio</span>
                    <span className="htp-combolist-min">3 same rank</span>
                    <span className="htp-combolist-notes">Only a higher trio beats a trio.</span>
                  </div>
                  <div className="htp-combolist-row">
                    <span className="htp-combolist-type">Full house</span>
                    <span className="htp-combolist-min">Trio + pair</span>
                    <span className="htp-combolist-notes">The trio’s rank determines which full house is higher.</span>
                  </div>
                  <div className="htp-combolist-row">
                    <span className="htp-combolist-type">Straight</span>
                    <span className="htp-combolist-min">5+ consecutive ranks</span>
                    <span className="htp-combolist-notes">You must match the length to beat it.</span>
                  </div>
                </div>
              </section>

              <section id="specials" className="htp-section">
                <div className="htp-section-head">
                  <h2 className="htp-h2">Special cards</h2>
                  <div className="htp-chip">Reference</div>
                </div>

                <div className="htp-cardgrid">
                  <div className="htp-card">
                    <h3 className="htp-h3">Mah Jong (1)</h3>
                    <p className="htp-muted">
                      Ranks as 1 (lowest). If you hold it, it must be the opening play.
                    </p>
                    <ul className="htp-bullets">
                      <li>
                        Must be played first (single or in a straight containing 1).
                      </li>
                      <li>When played, announce a wish for a rank (A–K).</li>
                      <li>The wish stays active until fulfilled.</li>
                    </ul>
                  </div>

                  <div className="htp-card">
                    <h3 className="htp-h3">Dog</h3>
                    <p className="htp-muted">Has no trick‑taking power. It can only be played by leading it as a single.</p>
                    <ul className="htp-bullets">
                      <li>When led, it transfers the right to lead to your partner.</li>
                      <li>If your partner has already emptied their hand, the lead passes onward in turn order.</li>
                    </ul>
                  </div>

                  <div className="htp-card">
                    <h3 className="htp-h3">Phoenix</h3>
                    <p className="htp-muted">The wildcard. Worth −25 points if it ends up in your trick pile.</p>
                    <ul className="htp-bullets">
                      <li>Can replace a normal card in combinations, but not to create a bomb.</li>
                      <li>As a single, it’s worth half a rank higher than the current card (e.g., 8 → 8.5). If led, it counts as 1.5.</li>
                    </ul>
                  </div>

                  <div className="htp-card">
                    <h3 className="htp-h3">Dragon</h3>
                    <p className="htp-muted">The highest single. Worth +25 points. Only beaten by a bomb.</p>
                    <ul className="htp-bullets">
                      <li>If the Dragon wins a trick, the winner must give that trick to an opponent of their choice.</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section id="bombs" className="htp-section">
                <h2 className="htp-h2">Bombs</h2>
                <p>
                  A bomb is either (1) four of a kind, or (2) a straight flush of 5+ cards in the same suit.
                </p>
                <ul className="htp-bullets">
                  <li>Bombs can be played at any time—even out of turn—to take a trick.</li>
                  <li>To compare bombs: first by number of cards (more cards beats fewer), then by rank. A higher bomb beats a lower one, so bombs can be played on bombs.</li>
                </ul>
                <p className="htp-muted">
                  Examples: a straight flush of 6 beats a straight flush of 5; four Kings beats four 7s. A straight flush of 5 beats a four of a kind of Aces.
                </p>
              </section>

              <section id="end" className="htp-section">
                <h2 className="htp-h2">End of round</h2>
                <p>The round ends immediately when only one player still has cards.</p>
                <ul className="htp-bullets">
                  <li>The last player with cards gives their remaining hand to the opponents.</li>
                  <li>That player also gives the tricks they won to the player who emptied their hand first.</li>
                </ul>
              </section>

              <section id="scoring" className="htp-section">
                <h2 className="htp-h2">Scoring</h2>

                <p>
                At the end of the round, count the points in each team’s trick pile (the cards your team won). Then apply any Tichu bonuses (+100/−100 or +200/−200). See the table below for card values.                </p>

                <div className="htp-tablewrap htp-tablewrap-scoring" role="region" aria-label="Scoring table">
                  <table className="htp-table">
                    <thead>
                      <tr>
                        <th>Card</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Each 5</td>
                        <td>+5</td>
                      </tr>
                      <tr>
                        <td>Each 10</td>
                        <td>+10</td>
                      </tr>
                      <tr>
                        <td>Each K</td>
                        <td>+10</td>
                      </tr>
                      <tr>
                        <td>Dragon</td>
                        <td>+25</td>
                      </tr>
                      <tr>
                        <td>Phoenix</td>
                        <td>−25</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="htp-callout">
                  <div className="htp-callout-title">Double victory</div>
                  <p className="htp-callout-text">
                    If both players on the same team empty their hands first and second, card points are not counted and that team scores{' '}
                    <strong>200</strong> points.
                  </p>
                </div>
              </section>

              <section id="endgame" className="htp-section">
                <h2 className="htp-h2">End of game</h2>
                <p>
                  When a team reaches (or exceeds) <strong>1000</strong> points at the end of a round, they win.
                </p>
              </section>

              <section id="faq" className="htp-section">
                <h2 className="htp-h2">FAQ</h2>

                <div className="htp-faq">
                  <details className="htp-details">
                    <summary className="htp-details-summary">What if I can’t fulfill the wish?</summary>
                    <p className="htp-muted">
                      If you don’t have the wished rank (or can’t play it legally), you may play any legal card/combination or pass.
                    </p>
                  </details>

                  <details className="htp-details">
                    <summary className="htp-details-summary">Can I ignore the wish by bombing?</summary>
                    <p className="htp-muted">
                      Bombs are an interruption, not a normal turn. The wish is checked again on your next normal turn.
                    </p>
                  </details>

                  <details className="htp-details">
                    <summary className="htp-details-summary">What if both teams reach 1000?</summary>
                    <p className="htp-muted">
                      The team with the higher score wins. If the scores are tied, play continues until one team leads after a round.
                    </p>
                  </details>

                  <details className="htp-details">
                    <summary className="htp-details-summary">In a double victory, do Tichu bonuses still count?</summary>
                    <p className="htp-muted">
                      Yes. Card points are not counted, but any Small Tichu or Grand Tichu declarations still apply (+100/−100 or +200/−200 depending on whether that player emptied their hand first).
                    </p>
                  </details>

                  <details className="htp-details">
                    <summary className="htp-details-summary">Sequence of pairs: same number of pairs, only pairs?</summary>
                    <p className="htp-muted">
                      A sequence of pairs is made only from <strong>pairs</strong> (two of the same rank), not trios or single cards. Consecutive ranks, e.g. 2-2, 3-3, 4-4. To beat a sequence of pairs, you must play a sequence with the <strong>same number of pairs</strong> and higher rank—so you cannot beat 2-2-3-3 (two pairs) with 4-4-5-5-6-6 (three pairs); you would need a higher two-pair sequence, e.g. 3-3-4-4 or 4-4-5-5.
                    </p>
                  </details>
                </div>
              </section>
            </article>

            {/* Desktop cheat sheet */}
            <aside className="htp-cheatsheet" aria-label="Quick reference">
              <div className="htp-cheatsheet-card">
                <div className="htp-cheatsheet-title">Quick reference</div>

                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Points</div>
                  <ul className="htp-bullets">
                    <li>5 = +5</li>
                    <li>10 &amp; K = +10 each</li>
                    <li>Dragon = +25</li>
                    <li>Phoenix = −25</li>
                  </ul>
                </div>

                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Opening</div>
                  <p className="htp-muted">
                    If you hold <strong>Mah Jong</strong>, it must be the first play (single or in a straight containing 1), then
                    announce a wish.
                  </p>
                </div>

                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Bombs</div>
                  <p className="htp-muted">4‑of‑a‑kind or straight flush (5+). Can be played any time to take a trick.</p>
                </div>

                <div className="htp-cheat-block">
                  <div className="htp-cheat-title">Trick ends</div>
                  <p className="htp-muted">When 3 players pass in order.</p>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="how-to-play-footer htp-footer">
          <button type="button" className="how-to-play-back-btn htp-back" onClick={goBack}>
            ← Back
          </button>
        </footer>
      </div>
    </div>
  )
}

export default HowToPlay
