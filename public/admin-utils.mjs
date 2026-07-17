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

export function foldersInFolder(folders, folder) {
  const childPrefix = `${folder}/`;
  return folders.filter((path) => path === folder || path.startsWith(childPrefix));
}

export function folderVisibilityStatus(files, folder) {
  const childPrefix = `${folder}/`;
  const descendants = files.filter((file) => file.folder === folder || file.folder.startsWith(childPrefix));
  if (!descendants.length || descendants.every((file) => !file.visible)) return "none";
  return descendants.every((file) => file.visible) ? "all" : "some";
}
