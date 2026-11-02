# SelvaUtillityCodes

One repo for small independent utilities. Each tool lives in its own folder. Work for a tool happens on that tool's branch, then merges back here so every tool stays in one place.

Agents (Grok, Claude, Codex) follow [AGENTS.md](AGENTS.md).

## Tools

| Tool | Platform | Tech | Status | Folder |
| --- | --- | --- | --- | --- |
| Read Folders to Excel | desktop | VBScript, Excel | usable | [tools/desktop/read-folders-to-excel](tools/desktop/read-folders-to-excel) |
| File Studio | desktop | Electron, React, TypeScript | building | [tools/desktop/file-studio](tools/desktop/file-studio) |

## Layout

```
tools/<platform>/<tool-id>/     one tool
  README.md                      what it does and how to run it
  tool.yaml                      id, platform, tech, status
  src/                           code
tools/multi/<tool-id>/           a product that ships on more than one platform
shared/                          code used by two or more tools (empty until then)
templates/tool/                  copy this when you add a tool
```

Platforms are `desktop`, `web`, and `mobile`. Pick the platform where the tool runs. If one product has more than one client, put it in `tools/multi/<tool-id>/` and keep each client in its own subfolder.

## Branches

`main` is the integrated copy and is protected. Do not commit on `main`.

| Branch | Use |
| --- | --- |
| `feature/<tool-id>` | Ongoing work for one tool |
| `feature/<tool-id>-<change>` | A single change when the tool branch is busy |
| `story/<tool-id>-<change>` | Same, when you want a story branch |

Branch names have to match `feature/*` or `story/*` (one segment after the slash). `tool/<tool-id>` is not writable.

Create the tool branch from the latest `main`. Merge it back when the change is ready so the tool is not stranded on a side branch.

## Add a tool

1. Create `feature/<tool-id>` from `main`.
2. Copy `templates/tool/` to `tools/<platform>/<tool-id>/`.
3. Fill in `tool.yaml` and `README.md`. Put code only in that folder.
4. Add a row to the table in this file.

Details and rules are in [AGENTS.md](AGENTS.md).
