export class Binary {
  constructor(binary) {
    this.binary = binary;
  }

  toDecimal() {
    if (typeof this.binary !== 'string' || !/^[01]+$/.test(this.binary)) {
      throw new Error('Invalid binary string');
    }

    let decimal = 0;

    for (const digit of this.binary) {
      decimal = decimal * 2 + (digit === '1' ? 1 : 0);
    }

    return decimal;
  }
}
