// A text file's line endings. The editor works on text whose lines end with \n (that is what CodeMirror gives back, and
// what pasting and typing make), so a file that ends its lines with \r\n (made on Windows) is read as \n and written
// back with \r\n: saving it does not turn every line into a change. A file with both is read as the one it has more
// of; its lines then all end the same way when saved.

/** How a file's lines end. */
export type Eol = 'lf' | 'crlf';

/** `crlf` when the text has at least as many \r\n as lone \n (and some), else `lf`. */
export function detectEol(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
    if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++;
    else lf++;
  }
  return crlf > 0 && crlf >= lf ? 'crlf' : 'lf';
}

/** The text as the editor holds it: every line ends with \n. */
export function forEditor(text: string): string {
  return text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : text;
}

/** The editor's text as the file holds it: lines end the way the file's did (or the way the person chose). */
export function forDisk(text: string, eol: Eol): string {
  return eol === 'crlf' ? text.replace(/\r?\n/g, '\r\n') : text;
}
