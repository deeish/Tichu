# Testing Documentation

This folder contains comprehensive testing utilities for the Tichu game.

## Structure

```
tests/
├── unit/              # Unit tests for individual functions
│   ├── combinations.test.js
│   └── scoring.test.js
├── integration/       # Integration tests for game flows
│   └── gameFlow.test.js
├── bots/              # Test bots for automated gameplay
│   ├── testBot.js
│   └── botTestRunner.js
└── utils/             # Test helper utilities
    └── testHelpers.js
```

## Running Tests

### Install Dependencies
```bash
npm install --save-dev jest
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Unit tests only
npm test -- unit

# Integration tests only
npm test -- integration

# Bot simulations
node tests/bots/botTestRunner.js
```

### Run with Coverage
```bash
npm test -- --coverage
```

## Test Types

### Unit Tests
Test individual functions in isolation:
- `combinations.test.js` - Tests card combination validation
- `scoring.test.js` - Tests scoring calculations

### Integration Tests
Test complete game flows:
- `gameFlow.test.js` - Tests Dog priority, Mah Jong wish, rotation, etc.

### Bot Tests
Automated gameplay simulation:
- `testBot.js` - Bot class with different strategies
- `botTestRunner.js` - Run bot simulations

## Bot Strategies

- **random** - Plays random valid moves
- **aggressive** - Always tries to play highest cards
- **defensive** - Passes when possible, plays low cards
- **test-dog** - Always plays Dog if available (for testing)
- **test-mahjong** - Always plays Mah Jong with wish (for testing)

## Usage Examples

### Running Unit Tests
```bash
npm test combinations.test.js
```

### Running Bot Simulation
```bash
node tests/bots/botTestRunner.js
```

### Creating Custom Test
```javascript
const { createTestGame } = require('./tests/utils/testHelpers');
const { makeMove } = require('./game/moveHandler');

const game = createTestGame({
  hands: {
    p1: [{ type: 'standard', rank: 'K', suit: 'hearts' }]
  }
});

const result = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
console.log(result);
```

## Best Practices

1. **Unit tests first** - Test individual functions before integration
2. **Use test helpers** - Use `createTestGame()` for consistent game states
3. **Test edge cases** - Don't just test happy paths
4. **Keep tests fast** - Unit tests should run quickly
5. **Use descriptive names** - Test names should explain what they test

## Adding New Tests

1. Create test file in appropriate folder (`unit/` or `integration/`)
2. Import functions to test
3. Use Jest's `describe` and `test` functions
4. Run tests to verify they pass
5. Add to this README if adding new test categories
