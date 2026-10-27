const GROUP_PRICES = [0, 800, 1520, 2160, 2560, 3000];

export const cost = (books) => {
  const counts = [0, 0, 0, 0, 0];
  for (const book of books) {
    counts[book - 1] += 1;
  }

  counts.sort((a, b) => b - a);

  const groups = {
    1: counts[0] - counts[1],
    2: counts[1] - counts[2],
    3: counts[2] - counts[3],
    4: counts[3] - counts[4],
    5: counts[4],
  };

  // A 5-group plus a 3-group costs $51.60, but two 4-groups cost $51.20.
  const swaps = Math.min(groups[5], groups[3]);
  groups[5] -= swaps;
  groups[3] -= swaps;
  groups[4] += 2 * swaps;

  let total = 0;
  for (let size = 1; size <= 5; size += 1) {
    total += groups[size] * GROUP_PRICES[size];
  }
  return total;
};
