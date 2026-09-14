export function boardKey(row, column) {
  return String(row) + ',' + String(column);
}

export function isInsideBoard(row, column, boardSize) {
  return row >= 0 && row < boardSize && column >= 0 && column < boardSize;
}

