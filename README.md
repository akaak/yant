# meeting-notes

A Claude Code-style terminal REPL for taking meeting notes, embedding screenshots, and generating AI summaries.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Set your Anthropic API key (for AI summaries)
export ANTHROPIC_API_KEY=sk-ant-...
# Add to ~/.zshrc or ~/.bashrc to persist

# 3. Run
npm start
```

## Usage

| Command | Description |
|---|---|
| `/new <name>` | Start a new meeting (e.g. `/new Q3 Planning`) |
| `/screenshot` | Capture the previous window (Teams, browser, etc.) and embed in notes |
| `/end` | End meeting, generate AI summary, save everything |
| `/status` | Show active meeting name and file path |
| `/help` | List all commands |
| `/quit` | Exit (saves current meeting) |
| Any other text | Appended as a timestamped bullet point in your notes |

## Screenshot Flow

1. You're in a Teams/Zoom call in your browser
2. Switch to terminal, type `/screenshot`, press Enter
3. The app briefly brings your browser window to the front, takes a screenshot of it
4. Returns focus to your terminal automatically
5. Screenshot is saved to `screenshots/` and linked in your `notes.md`

> **Tip:** Grant your terminal app Accessibility + Screen Recording permissions in  
> System Settings → Privacy & Security → Accessibility / Screen Recording

## Notes Structure

Notes are saved to `~/meeting-notes/`:

```
~/meeting-notes/
└── 2025-03-09-q3-planning/
    ├── notes.md          ← your notes + AI summary
    └── screenshots/
        └── screenshot-2025-03-09T14-30-00.png
```

## Permissions (macOS)

For screenshots and window switching to work, grant your terminal these permissions:

- **System Settings → Privacy & Security → Accessibility** → add Terminal / iTerm2
- **System Settings → Privacy & Security → Screen & System Audio Recording** → add Terminal / iTerm2

These are required once; macOS will prompt you the first time.
