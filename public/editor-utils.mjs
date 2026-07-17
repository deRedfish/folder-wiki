export function prettifyMarkdown(source) {
  const output = [];
  let fence = null;

  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const fenceMatch = raw.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : (fence || marker);
      output.push(raw.trimEnd());
      continue;
    }
    if (fence) {
      output.push(raw);
      continue;
    }

    const hardBreak = / {2,}$/.test(raw) && !/^\s*(?:#{1,6}\s|[-+*]\s|\d+[.)]\s)/.test(raw.trimStart());
    let line = raw.replace(/\t/g, "  ").trimEnd();
    if (hardBreak && line) line += "  ";
    if (!line.trim()) {
      if (output.length && output.at(-1) !== "") output.push("");
      continue;
    }

    line = line.replace(/^(\s*#{1,6})[ \t]+/, "$1 ");
    line = line.replace(/^(\s*>)[ \t]*/, "$1 ");
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      output.push("---");
      continue;
    }
    line = line.replace(/^(\s*)[-+*][ \t]+/, "$1- ");
    line = line.replace(/^(\s*)\d+[.)][ \t]+/, (_, indent) => `${indent}1. `);
    output.push(line);
  }

  while (output[0] === "") output.shift();
  while (output.at(-1) === "") output.pop();
  return output.join("\n") + "\n";
}
