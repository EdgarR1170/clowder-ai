const ALPHABET_LENGTH = 26;
const A_CODE = 'a'.charCodeAt(0);

const mod = (value, modulus) => ((value % modulus) + modulus) % modulus;

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    [x, y] = [y, x % y];
  }

  return x;
};

const validateKey = (a) => {
  if (gcd(a, ALPHABET_LENGTH) !== 1) {
    throw new Error('a and m must be coprime.');
  }
};

const modularInverse = (a) => {
  for (let x = 1; x < ALPHABET_LENGTH; x += 1) {
    if (mod(a * x, ALPHABET_LENGTH) === 1) {
      return x;
    }
  }

  throw new Error('a and m must be coprime.');
};

const groupCharacters = (characters) => {
  const groups = [];

  for (let i = 0; i < characters.length; i += 5) {
    groups.push(characters.slice(i, i + 5).join(''));
  }

  return groups.join(' ');
};

export const encode = (phrase, key) => {
  validateKey(key.a);

  const a = mod(key.a, ALPHABET_LENGTH);
  const b = mod(key.b, ALPHABET_LENGTH);
  const encoded = [];

  for (const character of phrase.toLowerCase()) {
    if (character >= 'a' && character <= 'z') {
      const index = character.charCodeAt(0) - A_CODE;
      const encryptedIndex = mod(a * index + b, ALPHABET_LENGTH);
      encoded.push(String.fromCharCode(encryptedIndex + A_CODE));
    } else if (character >= '0' && character <= '9') {
      encoded.push(character);
    }
  }

  return groupCharacters(encoded);
};

export const decode = (phrase, key) => {
  validateKey(key.a);

  const a = mod(key.a, ALPHABET_LENGTH);
  const b = mod(key.b, ALPHABET_LENGTH);
  const inverse = modularInverse(a);
  let decoded = '';

  for (const character of phrase.toLowerCase()) {
    if (character >= 'a' && character <= 'z') {
      const encryptedIndex = character.charCodeAt(0) - A_CODE;
      const index = mod(inverse * (encryptedIndex - b), ALPHABET_LENGTH);
      decoded += String.fromCharCode(index + A_CODE);
    } else if (character >= '0' && character <= '9') {
      decoded += character;
    }
  }

  return decoded;
};
