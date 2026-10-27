export class Binary {
  constructor(binary) {
    this.binary = binary;
  }

  toDecimal() {
    if (typeof this.binary !== 'string' || !/^[01]+$/.test(this.binary)) {
      return 0;
    }

    let decimal = 0;

    for (const digit of this.binary) {
      decimal = decimal * 2 + Number(digit);
    }

    return decimal;
  }
}
