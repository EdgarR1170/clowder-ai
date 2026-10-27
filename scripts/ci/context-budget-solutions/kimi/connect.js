//
// This is only a SKELETON file for the 'Connect' exercise. It's been provided as a
// convenience to get you started writing code faster.
//

export class Board {
  constructor(board) {
    this.grid = board
      .trim()
      .split('\n')
      .map((row) => row.trim().split(/\s+/));
  }

  winner() {
    if (this.wins('O')) return 'O';
    if (this.wins('X')) return 'X';
    return '';
  }

  wins(player) {
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    const dirs = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
    const visited = new Set();
    const stack = [];

    if (player === 'O') {
      for (let c = 0; c < cols; c++) {
        if (this.grid[0][c] === 'O') stack.push([0, c]);
      }
    } else {
      for (let r = 0; r < rows; r++) {
        if (this.grid[r][0] === 'X') stack.push([r, 0]);
      }
    }

    while (stack.length > 0) {
      const [r, c] = stack.pop();
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (this.grid[r][c] !== player) continue;
      if (player === 'O' ? r === rows - 1 : c === cols - 1) return true;
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) stack.push([nr, nc]);
      }
    }

    return false;
  }
}
