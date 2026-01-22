/**
 * Test runner for bot simulations
 * Run this to test game flows with automated bots
 */

const { createTestGame } = require('../utils/testHelpers');
const { createBots, simulateGame } = require('./testBot');

/**
 * Test Dog priority flow
 */
function testDogPriority() {
  console.log('\n=== Testing Dog Priority Flow ===');
  
  const game = createTestGame({
    hands: {
      p1: [{ type: 'special', name: 'dog' }],
      p2: [{ type: 'standard', rank: 'K', suit: 'hearts' }],
      p3: [{ type: 'standard', rank: 'Q', suit: 'hearts' }],
      p4: [{ type: 'standard', rank: 'J', suit: 'hearts' }]
    }
  });

  const bots = createBots(['test-dog', 'random', 'random', 'random']);
  const result = simulateGame(game, bots, 50);

  console.log(`Game completed in ${result.moves} moves`);
  console.log(`Final state: ${result.finalState}`);
  console.log(`Dog priority player: ${game.dogPriorityPlayer}`);
  
  return result;
}

/**
 * Test Mah Jong wish flow
 */
function testMahJongWish() {
  console.log('\n=== Testing Mah Jong Wish Flow ===');
  
  const game = createTestGame({
    hands: {
      p1: [{ type: 'special', name: 'mahjong' }],
      p2: [{ type: 'standard', rank: 'K', suit: 'hearts' }],
      p3: [{ type: 'standard', rank: 'Q', suit: 'hearts' }],
      p4: [{ type: 'standard', rank: 'J', suit: 'hearts' }]
    }
  });

  const bots = createBots(['test-mahjong', 'random', 'random', 'random']);
  const result = simulateGame(game, bots, 50);

  console.log(`Game completed in ${result.moves} moves`);
  console.log(`Mah Jong wish: ${JSON.stringify(game.mahJongWish)}`);
  
  return result;
}

/**
 * Test full game simulation
 */
function testFullGame() {
  console.log('\n=== Testing Full Game Simulation ===');
  
  // Create a game with full hands (simplified)
  const game = createTestGame({
    hands: {
      p1: Array(14).fill(null).map((_, i) => ({
        type: 'standard',
        rank: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][i % 13],
        suit: ['hearts', 'diamonds', 'clubs', 'spades'][Math.floor(i / 13)]
      })),
      p2: Array(14).fill(null).map((_, i) => ({
        type: 'standard',
        rank: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][(i + 1) % 13],
        suit: ['hearts', 'diamonds', 'clubs', 'spades'][Math.floor((i + 1) / 13)]
      })),
      p3: Array(14).fill(null).map((_, i) => ({
        type: 'standard',
        rank: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][(i + 2) % 13],
        suit: ['hearts', 'diamonds', 'clubs', 'spades'][Math.floor((i + 2) / 13)]
      })),
      p4: Array(14).fill(null).map((_, i) => ({
        type: 'standard',
        rank: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][(i + 3) % 13],
        suit: ['hearts', 'diamonds', 'clubs', 'spades'][Math.floor((i + 3) / 13)]
      }))
    }
  });

  const bots = createBots(['random', 'random', 'random', 'random']);
  const result = simulateGame(game, bots, 1000);

  console.log(`Game completed in ${result.moves} moves`);
  console.log(`Final state: ${result.finalState}`);
  console.log(`Players out: ${game.playersOut.join(', ')}`);
  
  return result;
}

// Run tests if executed directly
if (require.main === module) {
  console.log('Starting bot test simulations...\n');
  
  try {
    testDogPriority();
    testMahJongWish();
    // testFullGame(); // Uncomment for full game test (may take longer)
    
    console.log('\n✅ All bot tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

module.exports = {
  testDogPriority,
  testMahJongWish,
  testFullGame
};
