export const DC_GUIDE = [
  [5, "Very easy"], [10, "Easy"], [12, "Moderate"], [15, "Challenging"], [18, "Hard"], [20, "Very hard"], [25, "Formidable"], [30, "Nearly impossible"]
];

export const CONDITIONS = [
  ["Blinded", "Cannot see. Attacks against it have advantage; its attacks have disadvantage."],
  ["Charmed", "Cannot attack the charmer or target the charmer with harmful abilities. The charmer has advantage on social checks against it."],
  ["Deafened", "Cannot hear and automatically fails checks that require hearing."],
  ["Frightened", "Disadvantage on checks and attacks while the source is in sight; cannot willingly move closer to the source."],
  ["Grappled", "Speed becomes 0. Ends when the grappler is incapacitated or the creature is moved out of reach."],
  ["Incapacitated", "Cannot take actions or reactions."],
  ["Invisible", "Impossible to see without special sense. Attacks against it have disadvantage; its attacks have advantage."],
  ["Paralyzed", "Incapacitated, cannot move or speak, fails Strength and Dexterity saves, and attacks against it have advantage. Hits from within 5 feet are critical hits."],
  ["Petrified", "Transformed into a solid substance, incapacitated, unaware, resistant to damage, and immune to poison and disease."],
  ["Poisoned", "Disadvantage on attack rolls and ability checks."],
  ["Prone", "Only crawl or stand. Attacks have disadvantage; attacks within 5 feet have advantage, other attacks have disadvantage."],
  ["Restrained", "Speed becomes 0, attacks have disadvantage, Dexterity saves have disadvantage, and attacks against it have advantage."],
  ["Stunned", "Incapacitated, cannot move, can speak only falteringly, fails Strength and Dexterity saves, and attacks against it have advantage."],
  ["Unconscious", "Incapacitated, cannot move or speak, unaware, drops held items, falls prone, and attacks against it have advantage. Hits from within 5 feet are critical hits."]
];

export const QUICK_RULES = [
  { title: "Action economy", items: ["On your turn: movement, one action, one bonus action if available, and one reaction each round.", "An opportunity attack uses your reaction when a creature leaves your reach.", "Difficult terrain costs 2 feet of movement per foot traveled.", "A creature can interact with one object for free; a second interaction may require an action."] },
  { title: "Cover", items: ["Half cover: +2 AC and Dexterity saves.", "Three-quarters cover: +5 AC and Dexterity saves.", "Total cover: cannot be targeted directly by an attack or spell.", "A creature behind cover can still be affected by an area effect if the effect's origin reaches it."] },
  { title: "Resting", items: ["Short rest: at least 1 hour; spend Hit Dice to recover hit points.", "Long rest: at least 8 hours; regain all lost hit points and up to half expended Hit Dice.", "A long rest can be interrupted by at least 1 hour of walking, fighting, casting, or similar exertion.", "A character can benefit from only one long rest in a 24-hour period."] },
  { title: "Concentration", items: ["Only one concentration spell at a time. Casting another concentration spell ends the first.", "Taking damage requires a Constitution save: DC 10 or half the damage, whichever is higher.", "Concentration ends if the caster becomes incapacitated or dies.", "A caster can choose to end concentration at any time, no action required."] }
];

export const TRAVEL = [
  ["Fast", "400 ft/min", "4 mi/hour", "30 mi/day", "-5 passive Perception"],
  ["Normal", "300 ft/min", "3 mi/hour", "24 mi/day", "—"],
  ["Slow", "200 ft/min", "2 mi/hour", "18 mi/day", "Can use Stealth"],
  ["Forced march", "After 8 hours", "Constitution save each hour", "Exhaustion on failure", "—"]
];

export const MONSTER_STATS = [
  ["0", "12", "1-6", "+2", "1", "2"], ["1/8", "13", "7-11", "+3", "1", "4"], ["1/4", "13", "10-16", "+3", "1", "5"],
  ["1/2", "13", "17-27", "+3", "2", "7"], ["1", "13", "28-42", "+4", "2", "9"], ["2", "14", "43-62", "+4", "2", "12"],
  ["3", "15", "63-82", "+5", "2", "16"], ["4", "16", "83-102", "+6", "2", "22"], ["5", "16", "103-122", "+7", "3", "28"],
  ["6", "17", "123-142", "+7", "3", "32"], ["7", "17", "143-162", "+8", "3", "38"], ["8", "17", "163-182", "+8", "3", "44"],
  ["9", "18", "183-202", "+9", "3", "50"], ["10", "18", "203-222", "+9", "4", "56"]
];

export const WEATHER = ["Clear skies", "Light rain", "Heavy rain", "Dense fog", "High winds", "Thunderstorm", "Light snowfall", "Snowstorm", "Heat haze", "Ashfall"];
export const IMPROVISED = ["A loose floorboard", "A half-remembered legend", "A suspicious merchant", "A locked door", "A sudden change in weather", "An old warning carved in stone", "A useful but incomplete map", "A sound from somewhere nearby"];
export const NAMES = ["Dolly Starheart", "Sybell Mountainwhisper", "Ward Dogheart", "Manter Darkwind", "Meredithe Titanboot", "Epone Flameglacier", "Uranos Foxsmile", "Phanes Spiritbright", "Berte Iceviper", "Gembert"];
