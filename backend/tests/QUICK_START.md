# Quick Start Guide

## Installation

1. Install Jest:
```bash
cd backend
npm install
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode (auto-rerun on file changes)
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

### Run Bot Simulations
```bash
npm run test:bots
```

## What's Included

### ✅ Unit Tests
- **combinations.test.js** - Tests card validation (pairs, straights, bombs, Phoenix sequences)
- **scoring.test.js** - Tests scoring calculations and point transfers

### ✅ Integration Tests
- **gameFlow.test.js** - Tests complete game flows:
  - Dog priority flow
  - Mah Jong wish flow
  - Rotation of play
  - Priority after winning hand

### ✅ Test Bots
- **testBot.js** - Automated players with different strategies
- **botTestRunner.js** - Run bot simulations to test game flows

### ✅ Test Utilities
- **testHelpers.js** - Helper functions to create test game states

## Quick Examples

### Test a Specific Function
```javascript
const { validateCombination } = require('../game/combinations');

test('Phoenix sequence should be valid', () => {
  const cards = [
    { type: 'special', name: 'phoenix' },
    { type: 'standard', rank: 'Q', suit: 'hearts' },
    { type: 'standard', rank: 'J', suit: 'hearts' },
    { type: 'standard', rank: 'J', suit: 'spades' }
  ];
  
  const result = validateCombination(cards);
  expect(result.valid).toBe(true);
});
```

### Test a Game Flow
```javascript
const { createTestGame } = require('./utils/testHelpers');
const { makeMove } = require('../game/moveHandler');

test('Dog gives priority to partner', () => {
  const game = createTestGame({
    hands: {
      p1: [{ type: 'special', name: 'dog' }],
      p2: [{ type: 'standard', rank: 'K', suit: 'hearts' }]
    }
  });

  makeMove(game, 'p1', [{ type: 'special', name: 'dog' }], 'play');
  
  expect(game.dogPriorityPlayer).toBe('p2');
});
```

### Run Bot Simulation
```javascript
const { createBots, simulateGame } = require('./bots/testBot');
const { createTestGame } = require('./utils/testHelpers');

const game = createTestGame();
const bots = createBots(['test-dog', 'random', 'random', 'random']);
const result = simulateGame(game, bots, 100);

console.log(`Game completed in ${result.moves} moves`);
```

## Next Steps

1. **Run the tests** to see what passes/fails
2. **Add more unit tests** for functions you want to verify
3. **Use bot simulations** to test complex game flows
4. **Write integration tests** for bugs you fix

## Tips

- Start with unit tests for core logic (combinations, scoring)
- Use integration tests for game flows (Dog, Mah Jong, etc.)
- Use bots to simulate full games and find edge cases
- Keep tests fast - unit tests should run in milliseconds
- Test edge cases, not just happy paths
