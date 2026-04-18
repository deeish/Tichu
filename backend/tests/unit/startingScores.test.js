const { parseStartingScores, WINNING_SCORE } = require('../../config/gameRules');

describe('parseStartingScores', () => {
  test('defaults to 0–0 when missing or invalid', () => {
    expect(parseStartingScores()).toEqual({ team1: 0, team2: 0 });
    expect(parseStartingScores(null)).toEqual({ team1: 0, team2: 0 });
    expect(parseStartingScores('x')).toEqual({ team1: 0, team2: 0 });
  });

  test('parses team scores', () => {
    expect(parseStartingScores({ team1: 100, team2: 200 })).toEqual({ team1: 100, team2: 200 });
    expect(parseStartingScores({ team1: '50', team2: '25' })).toEqual({ team1: 50, team2: 25 });
  });

  test('clamps to [0, WINNING_SCORE - 1]', () => {
    expect(parseStartingScores({ team1: -5, team2: 9999 })).toEqual({
      team1: 0,
      team2: WINNING_SCORE - 1,
    });
  });
});
