// Lets the file be dropped anywhere on the page. Without this script the form still works.
(() => {
  const form = document.getElementById('form');
  const input = document.getElementById('file');
  const drop = document.getElementById('drop');
  const words = document.getElementById('drop-words');
  const error = document.getElementById('error');
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const initial = words.textContent;

  document.documentElement.classList.add('js');

  const go = () => {
    words.textContent = 'Adding up…';
    error.hidden = true;
    form.requestSubmit();
  };

  input.addEventListener('change', () => { if (input.files.length) go(); });

  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    drop.classList.add('over');
  });
  document.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    if (--depth <= 0) { depth = 0; drop.classList.remove('over'); }
  });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    drop.classList.remove('over');
    if (e.dataTransfer.files.length !== 1) {
      error.textContent = 'Please drop just one file at a time.';
      error.hidden = false;
      return;
    }
    input.files = e.dataTransfer.files;
    go();
  });

  // Coming back with the browser's Back button should give a fresh drop box.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) { words.textContent = initial; form.reset(); }
  });
})();
