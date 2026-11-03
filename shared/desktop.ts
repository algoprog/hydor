// What the Mac app says outside its pages (a notification from the Mac), in the language you read the app in: the
// server words it from these with the pages' own dictionaries (npm run i18n:extract reads them here), and the app
// shows it.

/** A new version downloaded by itself, a minute before the app restarts into it. */
export const UPDATE_WORDS = {
  title: (version: string) => `Hydor ${version} is ready`,
  body: 'Restarting in a minute to install it. Running agents carry on.',
  action: 'Restart Now',
};
