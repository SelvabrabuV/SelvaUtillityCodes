# Agent guide

Grok, Claude, and Codex use this file as the only source of project rules. Claude also loads [CLAUDE.md](CLAUDE.md), which points here. If a tool folder has its own README, that README wins for how that tool runs. This file wins for where code goes and how branches work.

## What this repo is

SelvaUtillityCodes is a monorepo of independent utilities. Examples of future tools are a compare tool, screen share, and a file converter. They may be desktop, web, or mobile, and they may use different stacks.

Tools do not share a framework. Do not add a root app, a root package, or a repo-wide build unless a task needs one.

The repo folder name is spelled `SelvaUtillityCodes`. Keep that spelling in remotes, paths, and docs.

## Look here first

1. This file.
2. The table in [README.md](README.md).
3. `tools/<platform>/<tool-id>/README.md` and `tool.yaml` for the tool you were asked to change.

Do not scan the whole repo and refactor unrelated tools.

## Layout

```
tools/desktop/<tool-id>/     Windows or other desktop apps
tools/web/<tool-id>/         browser apps
tools/mobile/<tool-id>/      phone and tablet apps
tools/multi/<tool-id>/       one product, more than one platform
  desktop/  web/  mobile/    clients of that product only
shared/<name>/               a library used by two or more tools
templates/tool/              starter README and tool.yaml
```

Rules:

- `<tool-id>` is kebab-case and unique across the repo. It is the folder name and the branch name. Do not rename it casually.
- A tool folder must contain `README.md`, `tool.yaml`, and the code. Keep code under that folder.
- `src/` is the default code folder. Use another layout only when the stack requires it (for example a .NET project or an Android module), and say so in the tool README.
- Do not put a new tool in the repo root, and do not recreate `VSCode/`. That folder was only the first script; the script now lives at `tools/desktop/read-folders-to-excel/`.
- `shared/` is for code that two tools already call. Do not add a shared library for a single tool, and do not add one "just in case".
- Do not create empty platform folders beyond `desktop`, `web`, and `mobile`. Create `tools/multi/<tool-id>/` only when a product really has more than one client.

## tool.yaml

Every tool has a `tool.yaml` next to its README. Copy [templates/tool/tool.yaml](templates/tool/tool.yaml). Required fields:

| Field | Meaning |
| --- | --- |
| `id` | Same as the folder name |
| `name` | Short display name |
| `platform` | `desktop`, `web`, `mobile`, or `multi` |
| `technologies` | What it is built with. One tool may list several |
| `status` | `idea`, `building`, `usable`, or `parked` |
| `summary` | One or two sentences |
| `entry` | Path, relative to the tool folder, of the file or project you open first |
| `run` | How to start it, or `none` if it cannot be run yet |

`requires` is optional. Use it for things a machine must already have, such as Excel or a specific SDK.

## Add a tool

1. Sync `main`. Create `feature/<tool-id>` from `main`.
2. Copy `templates/tool/` to `tools/<platform>/<tool-id>/`.
3. Replace every `<placeholder>` in `tool.yaml` and `README.md`.
4. Add the implementation under that folder only.
5. Add one row to the table in `README.md`.
6. Do not edit other tools in the same change.

Pick the platform from where the user runs it, not from the language. A Python script with a window is `desktop`. A Python web app is `web`.

## Change a tool

1. Read that tool's `README.md` and `tool.yaml`.
2. Work on `feature/<tool-id>`, or on `feature/<tool-id>-<change>` / `story/<tool-id>-<change>` for a single change.
3. Stay inside that tool folder. Touch `shared/` or another tool only when the task says those tools must work together.
4. Update the tool README if the run steps or behavior change. Update `tool.yaml` if platform, tech, status, entry, or run changes.
5. Leave unrelated files alone. Do not drive-by restyle or "fix" a tool you were not asked to change.

## Branches

`main` holds every tool that is part of the repo. It is protected. Agents must not commit or push to `main`, `master`, `release*`, `qa`, `uat`, or `prod`.

Writable branch names:

- `feature/<tool-id>` for ongoing work on one tool
- `feature/<tool-id>-<change>` for a separate change
- `story/<tool-id>-<change>` when a story branch fits better
- `dev` only when someone asks for an integration branch

The name after `feature/` or `story/` is one segment. `feature/file-converter-batch` is valid. `feature/file-converter/batch` is not, because it will not match the writable pattern.

Do not invent `tool/<tool-id>` branches. Use a folder for the tool and a `feature/` or `story/` branch for the work.

A tool's code must land on `main` when the change is ready. Do not leave the only copy on a side branch.

Use Treecko git tools for branch, commit, and push on this repo. Do not force-push, delete branches, or rewrite history.

## Stacks

Each tool chooses its own technology. Do not standardize the repo on one language.

When you add a stack, ignore its build output in [.gitignore](.gitignore) if it is not already ignored. Do not commit `node_modules`, `bin`, `obj`, `.venv`, or secrets (`.env`, keys, certificates).

Prefer the smallest program that does the job. Match the style of the tool you are editing. A VBScript tool stays a script unless the task is to rewrite it.

## Current tool: read-folders-to-excel

Folder: `tools/desktop/read-folders-to-excel/`

Windows Script Host script. It asks for a folder, writes one Excel sheet per immediate subfolder, lists file names except names that contain `-meta.xml`, and saves `FolderStructure.xlsx` in the chosen folder. It needs Windows and desktop Excel.

Preserve that behavior unless the task explicitly changes it. Known rough edges (sheet-name collisions, sheet order) are not a license to rewrite the script during unrelated work.

## Before you finish

- The change is limited to the tool (and the README table, if you added a tool).
- `tool.yaml` `id` matches the folder name.
- The tool README still tells a person how to run it.
- You did not commit to `main`.
- You did not move, rename, or "clean up" other tools.
