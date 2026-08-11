export const TERRAIN_TYPES = [
  { value: "water", label: "Water", icon: "≋", description: "Seas, rivers, lakes, and flooded reaches.", colors: ["#477f91", "#24566d", "#9bc4c9"] },
  { value: "plains", label: "Plains", icon: "♒", description: "Open grassland, meadow, and rolling steppe.", colors: ["#91a85d", "#536f38", "#d0c779"] },
  { value: "hills", label: "Hills", icon: "∩", description: "Broken uplands, ridges, and gentle high country.", colors: ["#87935a", "#4f6239", "#c1a568"] },
  { value: "mountains", label: "Mountains", icon: "▲", description: "Peaks, high passes, and impassable ranges.", colors: ["#737975", "#3e4748", "#c6c5b8"] },
  { value: "dwarf-tunnels", label: "Dwarf tunnels", icon: "⚒", description: "Worked roads, vaults, and holds beneath the earth.", colors: ["#6d6658", "#34373a", "#c59a55"] },
  { value: "caverns", label: "Caverns", icon: "◆", description: "Natural caves, chasms, and lightless deeps.", colors: ["#555166", "#29283a", "#9990ad"] },
  { value: "swamps", label: "Swamps", icon: "♆", description: "Marshes, bogs, mires, and drowned lowlands.", colors: ["#637458", "#35483d", "#91a67b"] },
  { value: "wasteland", label: "Wasteland", icon: "☼", description: "Scarred, blasted, or otherwise hostile ground.", colors: ["#9a7b55", "#584a3d", "#c6a36f"] },
  { value: "forest", label: "Forest", icon: "♠", description: "Dense woodland, old growth, and trackless wilds.", colors: ["#47704b", "#25452f", "#7fa45e"] }
];

export const TERRAIN_CLIMATES = [
  { value: "", label: "Natural", icon: "◈", description: "The terrain in its ordinary regional form." },
  { value: "snowy", label: "Icy / snowy", icon: "❄", description: "Ice, permafrost, and deep seasonal snow." },
  { value: "arid", label: "Arid / barren", icon: "☀", description: "Drought, bare stone, dust, and windblown sand." },
  { value: "volcanic", label: "Volcanic", icon: "♨", description: "Ash, magma, sulphur, and fire-scarred rock." },
  { value: "lush", label: "Tropical / lush", icon: "✿", description: "Heavy growth, warm rain, and riotous life." },
  { value: "magic", label: "Fey / magic", icon: "✦", description: "Terrain transformed or corrupted by concentrated mana." }
];

const ALLOWED_CLIMATES = {
  water: ["", "snowy", "magic"],
  plains: ["", "snowy", "arid", "lush", "magic"],
  hills: ["", "snowy", "arid", "volcanic", "lush", "magic"],
  mountains: ["", "snowy", "arid", "volcanic", "magic"],
  "dwarf-tunnels": ["", "volcanic", "magic"],
  caverns: ["", "volcanic", "lush", "magic"],
  swamps: ["", "snowy", "lush", "magic"],
  wasteland: ["", "arid", "volcanic", "magic"],
  forest: ["", "snowy", "lush", "magic"]
};

const VARIANT_NAMES = {
  "water:snowy": "Frozen waters", "water:magic": "Mana-touched waters",
  "plains:snowy": "Snowfields", "plains:arid": "Dry steppe", "plains:lush": "Verdant plains", "plains:magic": "Fey meadows",
  "hills:snowy": "Frostbound hills", "hills:arid": "Badlands", "hills:volcanic": "Ashen hills", "hills:lush": "Emerald hills", "hills:magic": "Spellscarred hills",
  "mountains:snowy": "Glacial peaks", "mountains:arid": "Barren peaks", "mountains:volcanic": "Volcanic peaks", "mountains:magic": "Arcane peaks",
  "dwarf-tunnels:volcanic": "Magmaforged tunnels", "dwarf-tunnels:magic": "Runic deep roads",
  "caverns:volcanic": "Lava caverns", "caverns:lush": "Fungal depths", "caverns:magic": "Faelight caverns",
  "swamps:snowy": "Frozen mire", "swamps:lush": "Tropical wetlands", "swamps:magic": "Feymire",
  "wasteland:arid": "Dune desert", "wasteland:volcanic": "Ash wastes", "wasteland:magic": "Mana wastes",
  "forest:snowy": "Snowbound forest", "forest:lush": "Rainforest", "forest:magic": "Enchanted forest"
};

const byType = new Map(TERRAIN_TYPES.map((terrain) => [terrain.value, terrain]));
const byClimate = new Map(TERRAIN_CLIMATES.map((climate) => [climate.value, climate]));

export function terrainDefinition(value) { return byType.get(String(value || "")) || null; }
export function climateDefinition(value) { return byClimate.get(String(value || "")) || null; }
export function terrainClimates(type) {
  return (ALLOWED_CLIMATES[String(type || "")] || []).map((value) => climateDefinition(value));
}
export function isTerrainCombination(type, climate = "") {
  return Boolean(terrainDefinition(type) && (ALLOWED_CLIMATES[type] || []).includes(String(climate || "")));
}
export function terrainName(type, climate = "") {
  const terrain = terrainDefinition(type); if (!terrain) return "Unpainted terrain";
  return VARIANT_NAMES[`${type}:${climate}`] || terrain.label;
}

function channel(hex, offset) { return Number.parseInt(hex.slice(offset, offset + 2), 16); }
function mixColor(from, to, amount) {
  const mixed = [1, 3, 5].map((offset) => Math.round(channel(from, offset) * (1 - amount) + channel(to, offset) * amount));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function terrainPalette(type, climate = "") {
  const terrain = terrainDefinition(type) || TERRAIN_TYPES[0];
  let [base, detail, accent] = terrain.colors;
  if (climate === "snowy") { base = mixColor(base, "#dceaf0", .64); detail = mixColor(detail, "#7690a0", .42); accent = "#f6fbff"; }
  if (climate === "arid") { base = mixColor(base, "#d6a45d", .58); detail = mixColor(detail, "#775232", .38); accent = "#efd08a"; }
  if (climate === "volcanic") { base = mixColor(base, "#332d31", .68); detail = "#7e2f25"; accent = "#ee8b32"; }
  if (climate === "lush") { base = mixColor(base, "#4b9a58", .46); detail = mixColor(detail, "#174f38", .35); accent = "#9cce76"; }
  if (climate === "magic") { base = mixColor(base, "#76518e", .55); detail = "#3f315f"; accent = "#73d5d1"; }
  return { base, detail, accent };
}
