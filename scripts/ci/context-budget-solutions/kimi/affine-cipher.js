const ALPHABET_SIZE = 26;
const GROUP_SIZE = 5;

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

const mod = (n, m) => ((n % m) + m) % m;

const modularMultiplicativeInverse = (a, m) => {
  for (let x = 1; x < m; x += 1) {
    if ((a * x) % m === 1) return x;
  }
  throw new Error(`a and m must be coprime to decrypt, but gcd(${a}, ${m}) = ${gcd(a, m)}`);
};

const assertValidKey = ({ a }) => {
  if (gcd(a, ALPHABET_SIZE) !== 1) {
    throw new Error(`a and m must be coprime, but gcd(${a}, ${ALPHABET_SIZE}) = ${gcd(a, ALPHABET_SIZE)}`);
  }
};

const charToIndex = (ch) => ch.charCodeAt(0) - 97;
const indexToChar = (i) => String.fromCharCode(i + 97);
const isDigit = (ch) => ch >= '0' && ch <= '9';
const stripToLettersAndDigits = (phrase) => phrase.toLowerCase().replace(/[^a-z0-9]/g, '');

export const encode = (phrase, key) => {
  assertValidKey(key);
  const { a, b } = key;
  let encoded = '';
  for (const ch of stripToLettersAndDigits(phrase)) {
    encoded += isDigit(ch)
      ? ch
      : indexToChar(mod(a * charToIndex(ch) + b, ALPHABET_SIZE));
  }
  return encoded.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')).join(' ');
};

export const decode = (phrase, key) => {
  assertValidKey(key);
  const { a, b } = key;
  const inverse = modularMultiplicativeInverse(a, ALPHABET_SIZE);
  let decoded = '';
  for (const ch of stripToLettersAndDigits(phrase)) {
    decoded += isDigit(ch)
      ? ch
      : indexToChar(mod(inverse * (charToIndex(ch) - b), ALPHABET_SIZE));
  }
  return decoded;
};
