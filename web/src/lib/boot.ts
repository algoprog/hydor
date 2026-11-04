// The logo shown while the page loads (index.html #boot: HYDΩR, its Ω filling with water). It goes the moment the
// app has something of its own to show, in the same frame, with nothing in between.

export function endBoot() {
  document.getElementById('boot')?.remove();
}
