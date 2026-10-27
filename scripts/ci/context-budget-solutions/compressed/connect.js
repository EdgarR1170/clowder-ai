export class Board {
  constructor(board) {
    const rows = Array.isArray(board) ? board : String(board).split(/\r?\n/);

    this.board = rows.map((row) => {
      const trimmed = String(row).trim();
      if (trimmed === '') return [];

      return /\s/.test(trimmed)
        ? trimmed.split(/\s+/)
        : Array.from(trimmed);
    });
  }

  winner() {
    const board = this.board;
    if (board.length === 0) return '';

    const connects = (player, starts, reachedGoal) => {
      const visited = new Set();
      const stack = [];

      for (const [row, col] of starts) {
        if (board[row] && board[row][col] === player) {
          const key = `${row},${col}`;
          if (!visited.has(key)) {
            visited.add(key);
            stack.push([row, col]);
          }
        }
      }

      while (stack.length > 0) {
        const [row, col] = stack.pop();

        if (reachedGoal(row, col)) return true;

        const neighbors = [
          [row, col - 1],
          [row, col + 1],
          [row - 1, col],
          [row - 1, col + 1],
          [row + 1, col - 1],
          [row + 1, col],
        ];

        for (const [nextRow, nextCol] of neighbors) {
          if (
            nextRow < 0 ||
            nextRow >= board.length ||
            nextCol < 0 ||
            nextCol >= board[nextRow].length ||
            board[nextRow][nextCol] !== player
          ) {
            continue;
          }

          const key = `${nextRow},${nextCol}`;
          if (visited.has(key)) continue;

          visited.add(key);
          stack.push([nextRow, nextCol]);
        }
      }

      return false;
    };

    const xStarts = board.map((_, row) => [row, 0]);
    if (connects('X', xStarts, (row, col) => col === board[row].length - 1)) {
      return 'X';
    }

    const oStarts = (board[0] || []).map((_, col) => [0, col]);
    if (connects('O', oStarts, (row) => row === board.length - 1)) {
      return 'O';
    }

    return '';
  }
}
