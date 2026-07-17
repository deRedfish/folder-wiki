export function filesInFolder(files, folder) {
  const childPrefix = `${folder}/`;
  return files
    .filter((file) => file.folder === folder || file.folder.startsWith(childPrefix))
    .map((file) => file.path);
}

export function folderSelectionStatus(files, folder, selection) {
  const paths = filesInFolder(files, folder);
  if (!paths.length || paths.every((path) => !selection.has(path))) return "none";
  return paths.every((path) => selection.has(path)) ? "all" : "some";
}
