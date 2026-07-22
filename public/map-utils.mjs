export function cellKey(col, row) { return `${col}:${row}`; }

export function hexCenter(map, col, row) {
  const width = Math.sqrt(3) * map.hexSize;
  return {
    x: map.offsetX + width * (col + (row % 2 ? 0.5 : 0)) + width / 2,
    y: map.offsetY + map.hexSize * (1 + 1.5 * row)
  };
}

export function hexPoints(map, col, row) {
  const center = hexCenter(map, col, row);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 90);
    return `${(center.x + map.hexSize * Math.cos(angle)).toFixed(2)},${(center.y + map.hexSize * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

export function nearestHex(map, x, y) {
  let nearest = null; let distance = Infinity;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.columns; col++) {
      const center = hexCenter(map, col, row);
      const next = Math.hypot(center.x - x, center.y - y);
      if (next < distance) { distance = next; nearest = { col, row }; }
    }
  }
  return nearest;
}
