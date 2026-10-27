const GROUP_COST = [0, 800, 1520, 2160, 2560, 3000];

export const cost = (books) => {
  const counts = [0, 0, 0, 0, 0];
  for (const book of books) counts[book - 1]++;

  const memo = new Map();

  const solve = (state) => {
    if (state[0] === 0) return 0;

    const key = state.join(',');
    if (memo.has(key)) return memo.get(key);

    let first = 0;
    while (state[first] === 0) first++;

    const others = [];
    for (let i = first + 1; i < 5; i++) {
      if (state[i] > 0) others.push(i);
    }

    let best = Infinity;
    const combinations = 1 << others.length;

    for (let mask = 0; mask < combinations; mask++) {
      const next = state.slice();
      next[first]--;
      let groupSize = 1;

      for (let i = 0; i < others.length; i++) {
        if (mask & (1 << i)) {
          next[others[i]]--;
          groupSize++;
        }
      }

      next.sort((a, b) => b - a);
      const total = GROUP_COST[groupSize] + solve(next);
      if (total < best) best = total;
    }

    memo.set(key, best);
    return best;
  };

  return solve(counts.sort((a, b) => b - a)) / 100;
};
