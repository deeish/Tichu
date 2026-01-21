import { useState, useEffect, useMemo } from 'react';
import Hand from './Hand';
import Trick from './Trick';
import GameInfo from './GameInfo';
import Card from './Card';
import { sortCardsByRank } from '../utils/cardUtils';
import './GameBoard.css';

function GameBoard({ game, socket, playerId }) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [sortMode, setSortMode] = useState('none'); // 'none', 'asc', 'desc'
  const [mahJongWish, setMahJongWish] = useState('');
  const [showWishInput, setShowWishInput] = useState(false);
  // Exchange: [card for 1st recipient, 2nd, 3rd] – order matches game.exchangeRecipients
  const [exchangeAssignments, setExchangeAssignments] = useState([null, null, null]);

  useEffect(() => {
    if (!game || !game.turnOrder) return;

    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    setIsMyTurn(currentPlayer && currentPlayer.id === playerId);
  }, [game, playerId]);

  // Reset exchange assignments when leaving exchange phase
  useEffect(() => {
    if (game?.state !== 'exchanging') {
      setExchangeAssignments([null, null, null]);
    }
  }, [game?.state]);

  // Check if selected cards form a bomb (4 of a kind OR straight flush)
  const isBomb = () => {
    if (selectedCards.length < 4) return false;
    
    // Check for 4 of a kind
    if (selectedCards.length === 4) {
      const ranks = selectedCards.map(c => c.rank || c.name).filter(r => r !== 'phoenix');
      const uniqueRanks = new Set(ranks);
      if (uniqueRanks.size === 1) return true;
    }
    
    // Check for potential straight flush (5+ cards, all same suit)
    if (selectedCards.length >= 5) {
      const standardCards = selectedCards.filter(c => c.type === 'standard');
      if (standardCards.length === 0) return false;
      
      const suits = standardCards.map(c => c.suit);
      const uniqueSuits = new Set(suits);
      
      // If all cards are same suit, it could be a straight flush
      // (Backend will validate if it's actually consecutive)
      if (uniqueSuits.size === 1) return true;
    }
    
    return false;
  };

  const handleCardClick = (card) => {
    // Exchange: clicking a card assigns it to the first empty "To [recipient]" slot
    if (game.state === 'exchanging') {
      setExchangeAssignments(prev => {
        const i = prev.findIndex(x => !x);
        if (i === -1) return prev;
        const n = [...prev];
        n[i] = card;
        return n;
      });
      return;
    }

    // Playing: allow selection (and bombs out of turn)
    const canSelect = game.state === 'playing';
    if (!canSelect) return;

    const isSelected = selectedCards.some(selected =>
      selected.type === card.type &&
      (selected.type === 'standard'
        ? selected.suit === card.suit && selected.rank === card.rank
        : selected.name === card.name)
    );

    if (isSelected) {
      setSelectedCards(selectedCards.filter(selected =>
        !(selected.type === card.type &&
          (selected.type === 'standard'
            ? selected.suit === card.suit && selected.rank === card.rank
            : selected.name === card.name))
      ));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const handleRemoveFromSlot = (i) => {
    setExchangeAssignments(prev => {
      const n = [...prev];
      n[i] = null;
      return n;
    });
  };

  const handlePlayCards = () => {
    if (selectedCards.length === 0) return;
    
    // Check if Mah Jong is being played as a single
    const hasMahJong = selectedCards.some(c => c.name === 'mahjong');
    const isSingle = selectedCards.length === 1;
    const isFirstTrick = !game.currentTrick || game.currentTrick.length === 0;
    
    if (hasMahJong && isSingle && isFirstTrick) {
      // Need to get wish from user
      if (!mahJongWish) {
        setShowWishInput(true);
        return;
      }
    }
    
    socket.emit('make-move', {
      cards: selectedCards,
      action: 'play',
      mahJongWish: hasMahJong && isSingle && isFirstTrick ? mahJongWish : null
    });
    
    setSelectedCards([]);
    setMahJongWish('');
    setShowWishInput(false);
  };

  const handlePass = () => {
    socket.emit('make-move', {
      cards: [],
      action: 'pass'
    });
  };

  const handleDeclareGrandTichu = () => {
    socket.emit('declare-grand-tichu');
  };

  const handleDeclareTichu = () => {
    socket.emit('declare-tichu');
  };

  const handleRevealRemainingCards = () => {
    socket.emit('reveal-remaining-cards');
  };

  const handleExchangeCards = () => {
    if (exchangeAssignments.some(x => !x)) {
      alert('Assign 1 card to each recipient: click cards from your hand for each "To" slot.');
      return;
    }
    socket.emit('exchange-cards', exchangeAssignments);
    setExchangeAssignments([null, null, null]);
  };

  if (!game) {
    return <div>Loading game...</div>;
  }

  const myHand = game.hands[playerId] || [];
  const exchangeRecipients = game.exchangeRecipients || [];

  // During exchange, exclude cards already assigned to "To" slots
  const displayHand = useMemo(() => {
    if (!myHand || myHand.length === 0) return myHand || [];
    let base = myHand;
    if (game.state === 'exchanging' && exchangeAssignments.some(Boolean)) {
      const assigned = exchangeAssignments.filter(Boolean);
      base = myHand.filter(c => !assigned.includes(c));
    }
    try {
      if (sortMode === 'asc') return sortCardsByRank(base, true);
      if (sortMode === 'desc') return sortCardsByRank(base, false);
      return base;
    } catch (error) {
      console.error('Error sorting cards:', error);
      return base;
    }
  }, [myHand, sortMode, game?.state, exchangeAssignments]);
  
  const currentPlayer = game.turnOrder?.[game.currentPlayerIndex];
  const selectedIsBomb = isBomb();
  // Can play if: (it's your turn AND have cards selected) OR (selected cards form a bomb)
  const canPlay = game.state === 'playing' && selectedCards.length > 0 && 
    (isMyTurn || selectedIsBomb);
  const canPass = isMyTurn && game.state === 'playing';

  return (
    <div className="game-board">
      <GameInfo 
        game={game} 
        currentPlayer={currentPlayer}
        playerId={playerId}
      />

      <div className="game-area">
        <div className="opponents-area">
          {game.players
            .filter(p => p.id !== playerId)
            .map((player, index) => {
              const stack = game.playerStacks?.[player.id];
              const stackCount = stack?.cards?.length || 0;
              const stackPoints = stack?.points || 0;
              return (
                <div key={player.id} className="opponent">
                  <div className="opponent-info">
                    <span className="player-name">{player.name}</span>
                    <span className="team-badge">Team {player.team}</span>
                    <span className="card-count">
                      {game.handCounts?.[player.id] || 0} cards
                    </span>
                    {currentPlayer?.id === player.id && game.state === 'playing' && (
                      <span className="turn-indicator">👈 Their turn</span>
                    )}
                  </div>
                  {stackCount > 0 && (
                    <div className="player-stack">
                      <div className="stack-header">
                        <span className="stack-label">Stack: {stackCount} cards</span>
                        <span className="stack-points">{stackPoints} pts</span>
                      </div>
                      <div className="stack-cards">
                        {Array.from({ length: Math.min(stackCount, 10) }).map((_, i) => (
                          <div key={i} className="stack-card-back" />
                        ))}
                        {stackCount > 10 && (
                          <span className="stack-more">+{stackCount - 10}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        <div className="center-area">
          <Trick trick={game.currentTrick} players={game.players} />
        </div>

        <div className="player-area">
          <div className="my-hand-section">
            <div className="hand-header">
              <h3>Your Hand</h3>
              {isMyTurn && game.state === 'playing' && (
                <span className="your-turn">Your Turn!</span>
              )}
            </div>
            
            {game.playerStacks?.[playerId] && game.playerStacks[playerId].cards.length > 0 && (
              <div className="my-stack">
                <div className="stack-header">
                  <span className="stack-label">Your Stack: {game.playerStacks[playerId].cards.length} cards</span>
                  <span className="stack-points">{game.playerStacks[playerId].points} pts</span>
                </div>
                <div className="stack-cards">
                  {Array.from({ length: Math.min(game.playerStacks[playerId].cards.length, 10) }).map((_, i) => (
                    <div key={i} className="stack-card-back" />
                  ))}
                  {game.playerStacks[playerId].cards.length > 10 && (
                    <span className="stack-more">+{game.playerStacks[playerId].cards.length - 10}</span>
                  )}
                </div>
              </div>
            )}
            
            <div className="hand-controls">
              <div className="sort-buttons">
                <button
                  onClick={() => setSortMode('none')}
                  className={sortMode === 'none' ? 'btn-sort active' : 'btn-sort'}
                >
                  None
                </button>
                <button
                  onClick={() => setSortMode('asc')}
                  className={sortMode === 'asc' ? 'btn-sort active' : 'btn-sort'}
                >
                  ↑ Ascending
                </button>
                <button
                  onClick={() => setSortMode('desc')}
                  className={sortMode === 'desc' ? 'btn-sort active' : 'btn-sort'}
                >
                  ↓ Descending
                </button>
              </div>
            </div>
            
            <Hand
              cards={displayHand}
              onCardClick={handleCardClick}
              selectedCards={game.state === 'exchanging' ? [] : selectedCards}
              playable={game.state === 'exchanging' || game.state === 'playing'}
            />

            {game.state === 'grand-tichu' && !game.cardsRevealed?.[playerId] && (
              <div className="action-buttons">
                <button onClick={handleDeclareGrandTichu} className="btn btn-grand-tichu">
                  Declare Grand Tichu (+200)
                </button>
                <button 
                  onClick={handleRevealRemainingCards} 
                  className="btn btn-skip"
                >
                  Reveal Remaining Cards
                </button>
                <p className="phase-hint">You see 8 cards. Declare Grand Tichu or reveal the remaining 6 cards.</p>
              </div>
            )}

            {game.state === 'grand-tichu' && game.cardsRevealed?.[playerId] && (
              <div className="action-buttons">
                <p className="waiting-message">Waiting for other players to decide on Grand Tichu...</p>
              </div>
            )}

            {game.state === 'exchanging' && !game.exchangeCards?.[playerId] && (
              <div className="exchange-section">
                <p className="exchange-instruction">
                  Assign 1 card to each player: click a card from your hand, then it goes to the first empty slot. Click a card in a slot to return it.
                </p>
                <div className="exchange-slots">
                  {exchangeRecipients.map((rec, i) => (
                    <div key={rec.id} className="exchange-slot">
                      <span className="exchange-slot-label">
                        To {rec.name} ({rec.isPartner ? 'Partner' : 'Opponent'})
                      </span>
                      {exchangeAssignments[i] ? (
                        <div className="exchange-slot-card">
                          <Card card={exchangeAssignments[i]} onClick={() => handleRemoveFromSlot(i)} playable selected={false} />
                        </div>
                      ) : (
                        <div className="exchange-slot-empty">—</div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleExchangeCards}
                  disabled={exchangeAssignments.some(x => !x)}
                  className="btn btn-primary"
                >
                  Exchange Cards ({exchangeAssignments.filter(Boolean).length}/3)
                </button>
              </div>
            )}

            {game.state === 'exchanging' && game.exchangeCards?.[playerId] && (
              <div className="action-buttons">
                <p className="waiting-message">Waiting for other players to exchange cards...</p>
              </div>
            )}

            {game.dragonOpponentSelection && game.dragonOpponentSelection.playerId === playerId && (
              <div className="dragon-opponent-selection">
                <p className="dragon-selection-instruction">
                  You played the Dragon and won the trick! Choose which opponent receives the trick:
                </p>
                <div className="opponent-selection-buttons">
                  {game.players
                    .filter(p => p.id !== playerId && p.team !== game.players.find(pl => pl.id === playerId)?.team)
                    .map(opponent => (
                      <button
                        key={opponent.id}
                        onClick={() => socket.emit('select-dragon-opponent', opponent.id)}
                        className="btn btn-opponent-select"
                      >
                        Give to {opponent.name} (Team {opponent.team})
                      </button>
                    ))}
                </div>
                <p className="dragon-selection-hint">
                  Trick points: {game.dragonOpponentSelection.trickPoints}
                </p>
              </div>
            )}

            {game.state === 'playing' && (
              <div className="action-buttons">
                {/* Show Tichu button only if it's your turn and you haven't played first card */}
                {isMyTurn && !game.firstCardPlayed?.[playerId] && (
                  <button
                    onClick={handleDeclareTichu}
                    className="btn btn-tichu"
                  >
                    Declare Tichu (+100) - Before First Card
                  </button>
                )}
                
                {/* Show Mah Jong wish input if needed */}
                {showWishInput && isMyTurn && (
                  <div className="wish-input-section">
                    <p>Mah Jong requires a wish. What card rank do you wish for?</p>
                    <select
                      value={mahJongWish}
                      onChange={(e) => setMahJongWish(e.target.value)}
                      className="wish-select"
                    >
                      <option value="">Select a rank...</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                      <option value="7">7</option>
                      <option value="8">8</option>
                      <option value="9">9</option>
                      <option value="10">10</option>
                      <option value="J">J</option>
                      <option value="Q">Q</option>
                      <option value="K">K</option>
                      <option value="A">A</option>
                    </select>
                    <button
                      onClick={handlePlayCards}
                      disabled={!mahJongWish}
                      className="btn btn-primary"
                    >
                      Play with Wish
                    </button>
                    <button
                      onClick={() => {
                        setShowWishInput(false);
                        setMahJongWish('');
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                
                {/* Show active wish status */}
                {game.mahJongWish && game.mahJongWish.mustPlay && (
                  <div className="wish-status">
                    <p className="wish-message">
                      ⚠️ Active Wish: {game.mahJongWish.wishedRank} must be played as a single card
                    </p>
                  </div>
                )}
                
                {!showWishInput && (
                  <>
                    {selectedIsBomb && !isMyTurn && (
                      <div className="bomb-notice">
                        <p>💣 Bomb selected - Can be played out of turn!</p>
                      </div>
                    )}
                    <button
                      onClick={handlePlayCards}
                      disabled={!canPlay}
                      className={`btn ${selectedIsBomb ? 'btn-bomb' : 'btn-primary'}`}
                    >
                      {selectedIsBomb ? `💣 Play Bomb` : `Play Cards (${selectedCards.length})`}
                    </button>
                    <button
                      onClick={handlePass}
                      disabled={!canPass}
                      className="btn btn-secondary"
                    >
                      Pass
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameBoard;
