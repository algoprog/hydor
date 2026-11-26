# Instruction for a change

An app was built earlier, by someone else, for a person who does not program. It is in your working folder. What the maker first asked for is in `brief.md` and their answers
are in `answers.md`; **what they ask for now is in `change.md`**, in their own words, with what they say if you ask. Where it does not cover something, decide, and say in your
report what you decided.

- Change the app in the working folder. Nobody will touch the code after you: the maker will use what you leave. Everything that worked before has to go on working, and the
  maker's data (the folder the app keeps what it keeps in) has to survive the change.
- You have Node.js and npm and the working folder. Use any packages from the public npm registry. Do not search the web and do not look in any folder but your working
  folder and the `brief-change` folder next to it; what your own tools and instructions give you to work with, use.
- The app is checked from outside by someone who does not know how it was built. `ACCEPTANCE.md` says what the app has to do and describes the file `judge.json`, which is in the
  app's folder and says where things are. Keep it true: change it when an address, a field or a way in changes.
- When you are done, build the app if it needs building, start it as `judge.json` says, and try the change as a person would.
- Stop every process you start.
- You have {{BUDGET_USD}} US dollars of model use and {{MINUTES}} minutes in all, and whoever is driving this may stop you at either. When either is nearly used up, stop starting
  new things and leave the app as it is, with a true `judge.json`.

Report, in under 200 words: what you changed, what you decided where the maker's answers did not say, and anything you could not do.
