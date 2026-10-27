const bottles = (count) => {
  if (count === 0) return 'no more bottles';
  return `${count} bottle${count === 1 ? '' : 's'}`;
};

const verse = (count) => {
  if (count === 0) {
    return (
      'No more bottles of beer on the wall, no more bottles of beer.\n' +
      'Go to the store and buy some more, 99 bottles of beer on the wall.'
    );
  }

  const current = bottles(count);
  const next = bottles(count - 1);
  const action = count === 1 ? 'Take it down' : 'Take one down';

  return (
    `${current} of beer on the wall, ${current} of beer.\n` +
    `${action} and pass it around, ${next} of beer on the wall.`
  );
};

export const recite = (initialBottlesCount, takeDownCount) => {
  const verses = [];

  for (let count = initialBottlesCount; count > initialBottlesCount - takeDownCount; count--) {
    verses.push(verse(count));
  }

  return verses.join('\n\n');
};
