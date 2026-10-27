export const recite = (initialBottlesCount, takeDownCount = 1) => {
  const verses = [];
  for (let i = 0; i < takeDownCount; i++) {
    const current = initialBottlesCount - i;
    if (i > 0) verses.push('');
    verses.push(...verse(current));
  }
  return verses;
};

function verse(n) {
  if (n === 0) {
    return [
      'No more bottles of beer on the wall, no more bottles of beer.',
      'Go to the store and buy some more, 99 bottles of beer on the wall.',
    ];
  }
  const current = bottles(n);
  const remaining = n === 1 ? 'no more bottles' : bottles(n - 1);
  const take = n === 1 ? 'Take it down' : 'Take one down';
  return [
    `${current} of beer on the wall, ${current} of beer.`,
    `${take} and pass it around, ${remaining} of beer on the wall.`,
  ];
}

function bottles(n) {
  return `${n} bottle${n === 1 ? '' : 's'}`;
}
