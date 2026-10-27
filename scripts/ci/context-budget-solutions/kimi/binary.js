export class Binary {
  constructor(binary) {
    this.binary = binary;
  }

  toDecimal() {
    if (!/^[01]+$/.test(this.binary)) {
      return 0;
    }

    let decimal = 0;
    for (const digit of this.binary) {
      decimal = decimal * 2 + Number(digit);
    }
    return decimal;
  }
}
