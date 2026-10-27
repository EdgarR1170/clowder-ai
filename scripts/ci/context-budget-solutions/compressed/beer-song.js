const bottleText = (count) =>
  `${count === 0 ? 'no more' : count} bottle${count === 1 ? '' : 's'}`;

export const recite = (initialBottlesCount, takeDownCount) => {
  const verses = [];

  for (let i = 0; i < takeDownCount; i += 1) {
    const count = initialBottlesCount - i;

    if (count === 0) {
      verses.push(
        'No more bottles of beer on the wall, no more bottles of beer.\n' +
          'Go to the store and buy some more, 99 bottles of beer on the wall.'
      );
    } else if (count === 1) {
      verses.push(
        '1 bottle of beer on the wall, 1 bottle of beer.\n' +
          'Take it down and pass it around, no more bottles of beer on the wall.'
      );
    } else {
      const next = bottleText(count - 1);
      verses.push(
        `${count} bottles of beer on the wall, ${count} bottles of beer.\n` +
          `Take one down and pass it around, ${next} of beer on the wall.`
      );
    }
  }

  return verses.join('\n\n');
};
