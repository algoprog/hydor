// Where the Files page was left (a folder, a place, a file): its tool in the sidebar opens it there again.
let at = '/files';

export const rememberFilesPlace = (p: string) => {
  at = p;
};

export const filesPlace = () => at;
