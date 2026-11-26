// Everything works without this. It only shrinks phone photos before they are sent,
// and stops a double tap from saving the same thing twice.
const LONGEST = 1600;

for (const input of document.querySelectorAll('input[data-shrink]')) {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file || !file.type.startsWith('image/') || file.type === 'image/gif') return;
    const button = input.form.querySelector('button');
    button.disabled = true;
    try {
      const picture = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, LONGEST / Math.max(picture.width, picture.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(picture.width * scale);
      canvas.height = Math.round(picture.height * scale);
      const pen = canvas.getContext('2d');
      pen.fillStyle = '#fff';
      pen.fillRect(0, 0, canvas.width, canvas.height);
      pen.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob && blob.size < file.size) {
        const list = new DataTransfer();
        list.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        input.files = list.files;
      }
    } catch {
      // Send the photo as it is; the server says if it cannot take it.
    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.method !== 'post') return;
  if (form.dataset.sent) return event.preventDefault();
  form.dataset.sent = 'yes';
});
window.addEventListener('pageshow', () => {
  for (const form of document.forms) delete form.dataset.sent;
});
