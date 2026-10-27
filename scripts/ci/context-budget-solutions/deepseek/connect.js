export class Board {
  constructor(board) {
    const rows = Array.isArray(board) ? board : String(board).split('\n');
    this.grid = rows
      .filter((row) => row.trim().length > 0)
      .map((row) => row.trim().split(/\s+/));
  }

  winner() {
    const grid = this.grid;
    const height = grid.length;
    if (height === 0) return '';

    const width = Math.max(...grid.map((row) => row.length));
    if (width === 0) return '';

    const directions = [
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
    ];

    const hasConnection = (player, starts, reachedGoal) => {
      const visited = grid.map((row) => row.map(() => false));
      const stack = [];

      for (const [row, col] of starts) {
        if (
          row >= 0 &&
          row < height &&
          col >= 0 &&
          col < width &&
          grid[row][col] === player &&
          !visited[row][col]
        ) {
          visited[row][col] = true;
          stack.push([row, col]);
        }
      }

      while (stack.length > 0) {
        const [row, col] = stack.pop();
        if (reachedGoal(row, col)) return true;

        for (const [dRow, dCol] of directions) {
          const nextRow = row + dRow;
          const nextCol = col + dCol;
          if (
            nextRow >= 0 &&
            nextRow < height &&
            nextCol >= 0 &&
            nextCol < width &&
            !visited[nextRow][nextCol] &&
            grid[nextRow][nextCol] === player
          ) {
            visited[nextRow][nextCol] = true;
            stack.push([nextRow, nextCol]);
          }
        }
      }

      return false;
    };

    const oStarts = [];
    for (let col = 0; col < width; col += 1) oStarts.push([0, col]);
    if (hasConnection('O', oStarts, (row) => row === height - 1)) return 'O';

    const xStarts = [];
    for (let row = 0; row < height; row += 1) xStarts.push([row, 0]);
    if (hasConnection('X', xStarts, (row, col) => col === width - 1)) return 'X';

    return '';
  }
}
