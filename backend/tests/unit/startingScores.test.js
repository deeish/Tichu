const { parseStartingScores } = require('../../config/gameRules');

describe('parseStartingScores', () => {
  test('defaults to 0–0 when missing or invalid', () => {
    expect(parseStartingScores()).toEqual({ team1: 0, team2: 0 });
    expect(parseStartingScores(null)).toEqual({ team1: 0, team2: 0 });
    expect(parseStartingScores('x')).toEqual({ team1: 0, team2: 0 });
  });

  test('parses team scores (multiples of 5)', () => {
    expect(parseStartingScores({ team1: 100, team2: 200 })).toEqual({ team1: 100, team2: 200 });
    expect(parseStartingScores({ team1: '50', team2: '25' })).toEqual({ team1: 50, team2: 25 });
  });

  test('snaps to nearest 5 and caps below win', () => {
    expect(parseStartingScores({ team1: 97, team2: 98 })).toEqual({ team1: 95, team2: 100 });
    expect(parseStartingScores({ team1: 999, team2: 9999 })).toEqual({
      team1: 995,
      team2: 995,
    });
  });

  test('clamps negatives to 0', () => {
    expect(parseStartingScores({ team1: -5, team2: 0 })).toEqual({ team1: 0, team2: 0 });
  });

  test('accepts [team1, team2] tuple arrays', () => {
    expect(parseStartingScores([100, 50])).toEqual({ team1: 100, team2: 50 });
    expect(parseStartingScores([999])).toEqual({ team1: 0, team2: 0 });
  });
});
