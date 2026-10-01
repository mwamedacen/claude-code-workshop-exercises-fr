# Ma Place — workshop repo

Ma Place is a fictional flex-office app: you book a desk for the day or a meeting room on a floor plan. You improve it across the Claude Code labs. All people, `@ma-place.example` addresses, and usage data are fictional. The app's UI labels remain in French.

## Before the course

1. Install Node.js with `node:sqlite`, Git, GitHub CLI (`gh`), Chrome or Edge, Python, VS Code with the Claude Code and Jupyter extensions, and Claude Code connected to your Claude plan. `npm run check -- setup` reports the minimum versions needed by the repo's scripts.
2. On this repo's GitHub page, choose **Use this template**, then **Create a new repository** to make your own repo. A private repo is fine. Avoid **Fork**: a pull request could target the course repo. Clone your copy with `git clone <your repo URL>` and open that folder.
3. Run `npm run check -- setup`. Each ✘ tells you what to install or fix. Run it again on the morning of the course.
4. Prepare Python for lab 4 with `npm run python`. It creates `.venv` in your repo and installs pandas, matplotlib, ipykernel, and nbconvert. Select the `.venv` kernel in VS Code. You can do this during a break; the first download takes time.
5. Run `npm start`, then open the address it prints (starting at `http://localhost:3000`, or the first free port).

The Node app has no npm dependencies to install. Its demonstration SQLite database is created on first start. The September usage database in `analytics/` is separate and is read only for lab 4.

## Day 1 labs

| After block | Lab | Guide |
|---|---|---|
| 1 | 1 · The missing buttons (35 min) | [W1](ateliers/W1.md) |
| 2 | 2 · Something is broken (55 min) | [W2](ateliers/W2.md) |
| 3 | 3 · Rules, a feature, a new look (70 min) | [W3](ateliers/W3.md) |
| 4 | 4 · What the data says (56 min) | [W4](ateliers/W4.md) |

Each guide gives a mission, steps, visible checks, and several levels for people who finish early. [BACKLOG.md](BACKLOG.md) has more cards. If Claude notices a defect outside the current step, write it down and stay with the lab's goal.

## Checkpoints

The course repo has a `reference` branch and tags. Your repo made with **Use this template** may not include those tags: the `checkpoint` command fetches them from the course repo when needed. It first saves your work on a `sauvegarde-…` branch, then starts a new work branch at the requested point.

| Point | Reference state |
|---|---|
| `w1-depart` | App without the four booking buttons |
| `w2-depart` | Four buttons (end of lab 1) |
| `w2-correctif` | Playwright and the first defect fixed with a test |
| `w3-depart` | Five defects fixed (end of lab 2) |
| `w3-regles` | Project rules in CLAUDE.md |
| `w3-fonction` | “Salle libre maintenant” feature |
| `w4-depart` | New UI and “charte” skill (end of lab 3) |
| `w4-analyses` | Subagent, data skill, notebook, and backlog cards (end of lab 4) |

- `npm run checkpoint -- list`: list available checkpoints.
- `npm run checkpoint -- w3-fonction`: save your state and resume at this point.
- `npm run check -- w3-fonction`: verify the machine-checkable parts of your work.

`/rewind` acts inside a Claude Code session; repo checkpoints change Git files. They are separate mechanisms.

## Useful commands

- `npm start`: start the app. `npm start -- --maintenant 2026-10-07T14:05` sets a fixed clock for time-dependent exercises.
- `npm test`: run app tests.
- `npm run reset`: remove the demonstration database; the next app start recreates it.
- `npm run python`: prepare `.venv` for the notebook.
- `npm run check -- setup`: check your machine before the course.
- `npm run check -- <point>`: check a lab result.
- `npm run checkpoint -- <point>`: resume from a reference after saving work.

The floor plan belongs to the fictional Facilities team: the labs fix code without editing `data/floor-plan.json`. These exercises do not use the Ambient IT logo.
