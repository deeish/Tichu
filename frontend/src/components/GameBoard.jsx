import { useState, useEffect } from 'react';
import Hand from './Hand';
import Trick from './Trick';
import GameInfo from './GameInfo';
import { sortCardsByRank } from '../utils/cardUtils';
import './GameBoard.css';

function GameBoard({ game, socket, playerId }) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [sortMode, setSortMode] = useState('none'); // 'none', 'asc', 'desc', 'combinations'
  const [mahJongWish, setMahJongWish] = useState('');
  const [showWishInput, setShowWishInput] = useState(false);

  useEffect(() => {
    if (!game || !game.turnOrder) return;
    
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    setIsMyTurn(currentPlayer && currentPlayer.id === playerId);
  }, [game, playerId]);

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
    // Allow card selection during exchange phase or playing phase
    // During playing phase, allow selection even if not your turn (for bombs)
    const canSelect = game.state === 'exchanging' || game.state === 'playing';
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
      // During exchange, limit to 3 cards
      if (game.state === 'exchanging' && selectedCards.length >= 3) {
        return; // Can't select more than 3 cards for exchange
      }
      setSelectedCards([...selectedCards, card]);
    }
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
    if (selectedCards.length !== 3) {
      alert('You must select exactly 3 cards to exchange');
      return;
    }
    
    socket.emit('exchange-cards', selectedCards);
    setSelectedCards([]);
  };

  if (!game) {
    return <div>Loading game...</div>;
  }

  const myHand = game.hands[playerId] || [];
  
  // Apply sorting based on sortMode
  let displayHand = myHand;
  
  try {
    if (sortMode === 'asc' && myHand.length > 0) {
      displayHand = sortCardsByRank(myHand, true);
    } else if (sortMode === 'desc' && myHand.length > 0) {
      displayHand = sortCardsByRank(myHand, false);
    }
  } catch (error) {
    console.error('Error sorting cards:', error);
    // Fall back to original hand if there's an error
    displayHand = myHand;
  }
  
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
            .map((player, index) => (
              <div key={player.id} className="opponent">
                <div className="opponent-info">
                  <span className="player-name">{player.name}</span>
                  <span className="team-badge">Team {player.team}</span>
                  <span className="card-count">
                    {game.handCounts?.[player.id] || 0} cards
                  </span>
                  {currentPlayer?.id === player.id && (
                    <span className="turn-indicator">👈 Their turn</span>
                  )}
                </div>
              </div>
            ))}
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
              selectedCards={selectedCards}
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

            {game.state === 'exchanging' && (
              <div className="action-buttons">
                <p>Select 3 cards to exchange (1 to each opponent, 1 to partner)</p>
                <button 
                  onClick={handleExchangeCards}
                  disabled={selectedCards.length !== 3}
                  className="btn btn-primary"
                >
                  Exchange Cards ({selectedCards.length}/3)
                </button>
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
