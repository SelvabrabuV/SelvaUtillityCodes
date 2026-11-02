# Samples

Small files you can point DiffDesk at. They are not a test suite.

| Left | Right | What you should see |
| --- | --- | --- |
| `left/notes.txt` | `right/notes.txt` | The second line differs. |
| `left/people.csv` | `right/people.csv` | Keyed on `Id`, the name in row 1 differs. |
| `left/config.json` | `right/config.json` | Open these as JSON. Key order matches. `retries` is 2 on the left and 3 on the right. A default folder compare uses size and time, and those two files are the same length, so that view can call them identical. |

Open a folder comparison on `samples/left` and `samples/right` from the DiffDesk folder.
