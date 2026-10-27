const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const M = ALPHABET.length;
const COPRIME_ERROR = 'a and m must be coprime.';

const mod = (n, m) => ((n % m) + m) % m;

const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);

  while (b !== 0) {
    [a, b] = [b, a % b];
  }

  return a;
};

const isCoprime = (a, m) => gcd(a, m) === 1;

const modularInverse = (a) => {
  for (let i = 1; i < M; i += 1) {
    if (mod(a * i, M) === 1) {
      return i;
    }
  }

  throw new Error(COPRIME_ERROR);
};

const group = (text) => (text.match(/.{1,5}/g) || []).join(' ');

const transform = (phrase, key, decrypting) => {
  const { a, b } = key;

  if (!isCoprime(a, M)) {
    throw new Error(COPRIME_ERROR);
  }

  const inverse = decrypting ? modularInverse(a) : null;
  const cleaned = phrase.toLowerCase().replace(/[^a-z0-9]/g, '');

  const result = [...cleaned]
    .map((char) => {
      if (char < 'a' || char > 'z') {
        return char;
      }

      const x = char.charCodeAt(0) - 'a'.charCodeAt(0);
      const y = decrypting
        ? mod(inverse * (x - b), M)
        : mod(a * x + b, M);

      return ALPHABET[y];
    })
    .join('');

  return decrypting ? result : group(result);
};

export const encode = (phrase, key) => transform(phrase, key, false);

export const decode = (phrase, key) => transform(phrase, key, true);
