const N = 6;
const board = document.getElementById("board");
const statusText = document.getElementById("status");

let queens = [];

// Create board
for (let row = 0; row < N; row++) {
  for (let col = 0; col < N; col++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.classList.add((row + col) % 2 === 0 ? "white" : "black");
    cell.dataset.row = row;
    cell.dataset.col = col;
    cell.addEventListener("click", () => placeQueen(cell, row, col));
    board.appendChild(cell);
  }
}

function placeQueen(cell, row, col) {
  // Remove queen if already placed
  const index = queens.findIndex(q => q.row === row && q.col === col);
  if (index !== -1) {
    queens.splice(index, 1);
    cell.innerHTML = "";
    statusText.innerText = "";
    return;
  }

  if (isSafe(row, col)) {
    queens.push({ row, col });
    cell.innerHTML = "♕";
    statusText.innerText = "Valid move ✅";

    if (queens.length === N) {
      statusText.innerText = "🎉 You solved the 6-Queen problem!";
    }
  } else {
    cell.classList.add("invalid");
    statusText.innerText = "❌ Invalid move! Queens attack each other.";
    setTimeout(() => cell.classList.remove("invalid"), 500);
  }
}

function isSafe(row, col) {
  for (let q of queens) {
    if (
      q.row === row ||
      q.col === col ||
      Math.abs(q.row - row) === Math.abs(q.col - col)
    ) {
      return false;
    }
  }
  return true;
}

function resetGame() {
  queens = [];
  document.querySelectorAll(".cell").forEach(cell => cell.innerHTML = "");
  statusText.innerText = "";
}
