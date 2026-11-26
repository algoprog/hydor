# Instruction for the builder

You are building one web app for a person who does not program. What they asked for is in `brief.md`, in their own words. If you want to ask them something, their answers
are in `answers.md`: look up what you need. Where it does not cover something, decide, and say in your report what you decided.

- Make the app in the working folder you were given. Nobody will touch the code after you: the maker will use what you leave.
- You have Node.js and npm and an empty working folder. Use any stack you like, and any packages from the public npm registry. Do not search the web and do not look in any
  folder but your working folder and the `brief` folder next to it; what your own tools and instructions give you to build with, use.
- The app is checked from outside by someone who does not know how you built it. `ACCEPTANCE.md` says what the app has to do (start in production with one command,
  keep what it keeps in one folder, say its words in the page itself, keep secrets on the server) and describes the one file you write for them, `judge.json`. Read it first,
  write `judge.json` as you go, and keep it true.
- Give every kind of thing the app keeps HTTP routes, as `ACCEPTANCE.md` says. Nothing else special is asked.
- When you are done, build the app if it needs building, start it as `judge.json` says, and try it as a person would.
- Stop every process you start.
- You have {{BUDGET_USD}} US dollars of model use and {{MINUTES}} minutes in all, and whoever is driving this may stop you at either. When either is nearly used up, stop starting
  new things and leave the app as it is, with a true `judge.json`.

Report, in under 300 words: what you made, what you decided where the maker's answers did not say, and anything you could not do.
