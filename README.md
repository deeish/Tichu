# Tichu - Web Application

A web-based implementation of Tichu, a strategic Chinese partnership card game.

## Game Rules

### Overview
Tichu is a strategic partnership card game for **4 players** forming **2 teams**. Partners sit opposite each other. The goal is to be the first team to reach **1,000 points**.

### Deck
- **56 cards total**: Standard 52-card deck + 4 special cards
- **Special Cards**:
  - **Mah Jong (1)**: Holder leads the first trick and can make a "wish" for a specific card rank
  - **Dog**: Must be played as the lead card, passes the lead to your partner
  - **Phoenix**: Acts as a wild card, worth **-25 points**
  - **Dragon**: Highest single card, worth **+25 points**, but if it wins a trick, you must give that trick to an opponent

### Dealing & Setup
1. Each player is dealt **8 cards** initially
2. Players may declare **"Grand Tichu"** (200-point bet) before seeing remaining cards
3. **6 more cards** are dealt to each player (total 14 cards)
4. Players may declare **"Tichu"** (100-point bet) before playing first card
5. **Card Exchange**: Each player passes 1 card to each opponent and 1 card to their partner (3 cards total)

### Gameplay
- The player with **Mah Jong** leads the first trick
- Players take turns playing valid card combinations
- Goal: Be the **first to play all your cards**

### Valid Card Combinations
- **Single card**: One card
- **Pair**: Two cards of the same rank
- **Triple**: Three cards of the same rank
- **Straight**: Sequence of 5+ cards (e.g., 3-4-5-6-7)
- **Full House**: Three of a kind + pair
- **Bomb**: 
  - Four of a kind (beats everything except higher bombs)
  - Straight flush (5+ consecutive cards of same suit, beats four of a kind)

### Scoring
- **Card Points**:
  - Each **5** = 5 points
  - Each **10** = 10 points
  - Each **King** = 10 points
  - **Dragon** = +25 points
  - **Phoenix** = -25 points
- **Tichu Calls**:
  - **Tichu** (called after seeing all cards): +100 points if successful, -100 if failed
  - **Grand Tichu** (called after 8 cards): +200 points if successful, -200 if failed
- First team to reach **1,000 points** wins

### Turn Order
1. Lead player plays a combination
2. Other players must play a higher combination of the same type, or pass
3. Last player to play wins the trick and leads the next trick
4. If Dragon wins a trick, that trick must be given to an opponent

## Development Guide

### Architecture Overview

For a card game web app, you'll need:

1. **Frontend (Client-Side)**
   - Display game board and cards
   - Handle user interactions (card selection, moves)
   - Show game state (scores, whose turn, etc.)
   - Real-time updates from server

2. **Backend (Server-Side)**
   - Game logic and rules enforcement
   - State management (deck, hands, scores)
   - Real-time communication (WebSockets)
   - Player matching and game rooms

3. **Key Components to Build**
   - **Deck Manager**: Create, shuffle, deal cards
   - **Game State**: Track hands, scores, current trick, turn order
   - **Move Validator**: Check if moves are legal
   - **Combination Checker**: Validate pairs, straights, bombs, etc.
   - **Scoring System**: Calculate points from tricks
   - **Real-time Sync**: Keep all players' views synchronized

### Technology Stack Recommendations

**Frontend:**
- React, Vue.js, or vanilla JavaScript
- WebSocket client for real-time updates
- CSS/SCSS for styling

**Backend:**
- Node.js with Express
- Socket.io for WebSocket communication
- Or Python with Flask/FastAPI + WebSockets

**Database (Optional for persistence):**
- PostgreSQL or MongoDB for storing game history, user accounts

### Getting Started

1. Set up your frontend framework
2. Set up your backend server
3. Implement basic deck and card handling
4. Build the game state management
5. Add move validation
6. Implement real-time multiplayer
7. Polish the UI/UX

## Project Structure

```
Tichu/
├── backend/          # Server-side code
│   ├── game/        # Game logic
│   ├── server.js    # Express/Socket.io server
│   └── models/      # Data models
├── frontend/         # Client-side code
│   ├── components/  # React/Vue components
│   ├── game/        # Game-specific logic
│   └── styles/      # CSS files
└── README.md
```
