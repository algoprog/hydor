// What a new install's first screen shares with the tour, without the tour itself: Tour.tsx brings much of the app with
// it, and the sign-in screens must not wait for all of that.

/** The app builds up as the tour shows it: <html data-tour-build> names the parts shown so far, with "all" as the
 * tour ends, and the app is empty but for them (styles.css, "the tour builds the app up"). Null: the app is whole. */
export function build(parts: string | null) {
  if (parts === null) delete document.documentElement.dataset.tourBuild;
  else document.documentElement.dataset.tourBuild = parts;
}

/** A new install chose its password: the tour goes on from what to use, and the app comes in empty. */
let afterSetup = false;
export const setupDone = () => {
  afterSetup = true;
  build('');
};

/** Whether the tour takes over from a new install's password, once. */
export function takeAfterSetup(): boolean {
  const was = afterSetup;
  afterSetup = false;
  return was;
}

/** Whether this is one of the desktop apps (desktop/main.cjs names it in the user agent). */
export const DESKTOP_APP = /\b(?:HydorMac|HydorWindows|HydorLinux|NagetAgentMac)\//.test(navigator.userAgent);

/** In a desktop app, the tour offers to set the app up on a phone too. */
export const PHONE_STEP = DESKTOP_APP;

/** Steps of a new install's tour before anything is picked, the password included (Tour.tsx checks it against its steps). */
export const TOUR_SETUP_STEPS = PHONE_STEP ? 10 : 9;
