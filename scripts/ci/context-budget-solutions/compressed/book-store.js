const GROUP_PRICES = [0, 800, 1520, 2160, 2560, 3000];

export const cost = (books) => {
  const counts = [0, 0, 0, 0, 0];

  for (const book of books) {
    counts[book - 1] += 1;
  }

  counts.sort((a, b) => a - b);

  const groups = [0, 0, 0, 0, 0, 0];
  let remaining = books.length;

  while (remaining > 0) {
    let size = 0;

    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] > 0) {
        counts[i] -= 1;
        size += 1;
        remaining -= 1;
      }
    }

    groups[size] += 1;
  }

  const swaps = Math.min(groups[5], groups[3]);
  groups[5] -= swaps;
  groups[3] -= swaps;
  groups[4] += swaps * 2;

  let total = 0;

  for (let size = 1; size <= 5; size += 1) {
    total += groups[size] * GROUP_PRICES[size];
  }

  return total / 100;
};
