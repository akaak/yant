# yant — Yet Another Note Tool

A Claude Code-style terminal REPL for taking meeting notes, embedding screenshots, and generating AI summaries.

## Install

```bash
npm install -g @akaak/yant
```

## Setup

```bash
# Set your Anthropic API key (required for AI summaries)
export ANTHROPIC_API_KEY=sk-ant-...
# Add to ~/.zshrc or ~/.bashrc to persist
```

> **macOS only.** For screenshots and window switching, grant your terminal Accessibility + Screen Recording permissions:
> **System Settings → Privacy & Security → Accessibility / Screen Recording** → add Terminal / iTerm2

## Usage

```bash
yant
```

| Command | Description |
|---|---|
| `/new <name>` | Start a new meeting (e.g. `/new Q3 Planning`) |
| `/screenshot` | Capture the previous window (Teams, browser, etc.) and embed in notes |
| `/end` | End meeting, generate AI summary, save everything |
| `/resume` | Resume the previous meeting |
| `/status` | Show active meeting name and file path |
| `/help` | List all commands |
| `/quit` | Exit (saves current meeting) |
| Any other text | Appended as a timestamped bullet point in your notes |

## Screenshot Flow

1. You're in a Teams/Zoom call in your browser
2. Switch to terminal, type `/screenshot`, press Enter
3. The app briefly brings your browser window to the front, takes a screenshot
4. Returns focus to your terminal automatically
5. Screenshot is saved to `screenshots/` and linked in your `notes.md`

## Notes Structure

Notes are saved to `~/meeting-notes/`:

```
~/meeting-notes/
└── 2025-03-09-q3-planning/
    ├── notes.md          ← your notes + AI summary
    └── screenshots/
        └── screenshot-2025-03-09T14-30-00.png
```
