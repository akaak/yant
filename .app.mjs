#!/usr/bin/env node

// index.js
import React2 from "react";
import { render } from "ink";

// App.js
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";

// notes.js
import fs from "fs";
import path from "path";
import os from "os";
var NOTES_BASE_DIR = path.join(os.homedir(), "meeting-notes");
function sanitizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);
}
function createMeetingDir(meetingName) {
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const safeName = sanitizeName(meetingName);
  const dirName = `${date}-${safeName}`;
  const meetingDir = path.join(NOTES_BASE_DIR, dirName);
  const screenshotsDir = path.join(meetingDir, "screenshots");
  fs.mkdirSync(meetingDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  return { meetingDir, screenshotsDir, dirName };
}
function initNotesFile(meetingDir, meetingName) {
  const notesPath = path.join(meetingDir, "notes.md");
  const now = /* @__PURE__ */ new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const header = `## ${dateStr} >> ${meetingName}

**Started:** ${timeStr}

---

`;
  fs.writeFileSync(notesPath, header, "utf8");
  return notesPath;
}
function appendToNotes(notesPath, text) {
  fs.appendFileSync(notesPath, text, "utf8");
}
function appendScreenshotToNotes(notesPath, screenshotInfo) {
  const now = /* @__PURE__ */ new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const entry = `
> \u{1F4F8} **Screenshot** \xB7 ${timeStr} \xB7 from *${screenshotInfo.targetApp}*

![Screenshot](${screenshotInfo.relativePath})

`;
  fs.appendFileSync(notesPath, entry, "utf8");
}
function appendSummaryToNotes(notesPath, summary) {
  const divider = `

---

## \u{1F916} AI Summary

${summary}
`;
  fs.appendFileSync(notesPath, divider, "utf8");
}
function finalizeNotes(notesPath) {
  const now = /* @__PURE__ */ new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  fs.appendFileSync(notesPath, `

---

**Ended:** ${timeStr}
`, "utf8");
}
function readNotes(notesPath) {
  if (!fs.existsSync(notesPath)) return "";
  return fs.readFileSync(notesPath, "utf8");
}
var SESSION_FILE = path.join(NOTES_BASE_DIR, ".session.json");
function saveSession(meeting, notesPath, screenshotsDir) {
  fs.mkdirSync(NOTES_BASE_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ meeting, notesPath, screenshotsDir }), "utf8");
}
function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}
function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}
function appendResumedToNotes(notesPath) {
  const now = /* @__PURE__ */ new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  fs.appendFileSync(notesPath, `
**Resumed:** ${timeStr}

`, "utf8");
}

// screenshot.js
import { execSync, exec } from "child_process";
import path2 from "path";
import fs2 from "fs";
var previousAppName = null;
function trackPreviousApp() {
  try {
    const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
    const result = execSync(`osascript -e '${script}'`, { timeout: 3e3 }).toString().trim();
    if (result && result !== "Terminal" && result !== "iTerm2" && result !== "iTerm") {
      previousAppName = result;
    }
  } catch (e) {
  }
}
async function captureWindowScreenshot(screenshotsDir, meetingName) {
  return new Promise((resolve, reject) => {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `screenshot-${timestamp}.png`;
    const filepath = path2.join(screenshotsDir, filename);
    fs2.mkdirSync(screenshotsDir, { recursive: true });
    const findWindowScript = `
      tell application "System Events"
        set appList to {"Google Chrome", "Microsoft Edge", "Safari", "Firefox", "Microsoft Teams", "zoom.us", "Slack"}
        repeat with appName in appList
          if exists (application process appName) then
            return appName
          end if
        end repeat
        return ""
      end tell
    `;
    let targetApp = null;
    try {
      targetApp = execSync(`osascript -e '${findWindowScript.replace(/\n/g, " ")}'`, {
        timeout: 3e3
      }).toString().trim();
    } catch (e) {
      targetApp = null;
    }
    if (!targetApp) {
      targetApp = previousAppName;
    }
    if (!targetApp) {
      reject(new Error("No target app found. Make sure a browser or Teams window is open."));
      return;
    }
    const captureScript = `
      tell application "${targetApp}"
        activate
      end tell
      delay 0.4
    `;
    exec(`osascript -e '${captureScript.replace(/\n/g, "\n")}'`, { timeout: 5e3 }, (err) => {
      const getWindowIdScript = `
        tell application "System Events"
          tell process "${targetApp}"
            set frontWindow to front window
            return id of frontWindow
          end tell
        end tell
      `;
      let windowId = null;
      try {
        windowId = execSync(`osascript -e '${getWindowIdScript.replace(/\n/g, " ")}'`, {
          timeout: 3e3
        }).toString().trim();
      } catch (e) {
        windowId = null;
      }
      let screencaptureCmd;
      if (windowId && windowId !== "") {
        screencaptureCmd = `screencapture -x -o -l ${windowId} "${filepath}"`;
      } else {
        screencaptureCmd = `screencapture -x "${filepath}"`;
      }
      exec(screencaptureCmd, { timeout: 5e3 }, (captureErr) => {
        const returnFocusScript = `
          tell application "System Events"
            set terminalApps to {"Terminal", "iTerm2", "iTerm", "Alacritty", "Warp", "Hyper"}
            repeat with termApp in terminalApps
              if exists (application process termApp) then
                tell application process termApp
                  set frontmost to true
                end tell
                return termApp
              end if
            end repeat
          end tell
        `;
        exec(`osascript -e '${returnFocusScript.replace(/\n/g, " ")}'`, { timeout: 3e3 }, () => {
          if (captureErr) {
            reject(new Error(`Screenshot failed: ${captureErr.message}`));
            return;
          }
          if (!fs2.existsSync(filepath)) {
            reject(new Error("Screenshot file was not created"));
            return;
          }
          resolve({
            filename,
            filepath,
            relativePath: `screenshots/${filename}`,
            targetApp
          });
        });
      });
    });
  });
}

// ai.js
import Anthropic from "@anthropic-ai/sdk";
var client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
async function summarizeMeetingNotes(notesContent) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a helpful assistant that summarizes meeting notes.

Below are raw meeting notes. Please provide a concise summary that includes:
- **Key Decisions** (if any)
- **Action Items** (if any, with owner if mentioned)
- **Main Discussion Points** (2-4 bullet points)

Keep the summary tight and useful. Do not pad it. If there are no decisions or action items, omit those sections.

---
${notesContent}
---

Provide only the summary, no preamble.`
      }
    ]
  });
  return response.content[0].text;
}

// App.js
import { jsx, jsxs } from "react/jsx-runtime";
var C = {
  accent: "#A78BFA",
  // violet
  green: "#4ADE80",
  yellow: "#FACC15",
  red: "#F87171",
  blue: "#60A5FA",
  muted: "#6B7280",
  dimmed: "#4B5563",
  white: "#F9FAFB",
  bg: "#111827",
  border: "#374151",
  timestamp: "#9CA3AF"
};
function timeNow() {
  return (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function LogLine({ line }) {
  const { type, text, timestamp } = line;
  const colorMap = {
    system: C.accent,
    info: C.blue,
    success: C.green,
    error: C.red,
    warning: C.yellow,
    note: C.white,
    screenshot: C.green,
    summary: C.accent,
    muted: C.muted,
    divider: C.border
  };
  const color = colorMap[type] || C.white;
  const prefix = {
    system: "\u25C6",
    info: "\xB7",
    success: "\u2713",
    error: "\u2717",
    warning: "\u26A0",
    note: "\u2502",
    screenshot: "\u{1F4F8}",
    summary: "\u2726",
    muted: " ",
    divider: "\u2500"
  }[type] || "\xB7";
  if (type === "divider") {
    return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: C.dimmed, children: "\u2500".repeat(60) }) });
  }
  return /* @__PURE__ */ jsxs(Box, { children: [
    type !== "note" && /* @__PURE__ */ jsxs(Text, { color: C.muted, children: [
      timestamp,
      " "
    ] }),
    /* @__PURE__ */ jsxs(Text, { color, children: [
      prefix,
      " "
    ] }),
    /* @__PURE__ */ jsx(Text, { color, children: text })
  ] });
}
function StatusBar({ meeting, notesPath, status }) {
  const meetingLabel = meeting ? /* @__PURE__ */ jsxs(Text, { color: C.green, children: [
    "\u25CF ",
    /* @__PURE__ */ jsx(Text, { color: C.white, bold: true, children: meeting })
  ] }) : /* @__PURE__ */ jsx(Text, { color: C.muted, children: "\u25CB no active meeting" });
  const statusLabel = status ? /* @__PURE__ */ jsxs(Text, { color: C.yellow, children: [
    " ",
    status
  ] }) : null;
  return /* @__PURE__ */ jsxs(
    Box,
    {
      borderStyle: "single",
      borderColor: C.border,
      paddingX: 1,
      justifyContent: "space-between",
      children: [
        /* @__PURE__ */ jsxs(Box, { gap: 2, children: [
          /* @__PURE__ */ jsx(Text, { color: C.accent, bold: true, children: "notes" }),
          /* @__PURE__ */ jsx(Text, { color: C.dimmed, children: "\u2502" }),
          meetingLabel,
          statusLabel
        ] }),
        /* @__PURE__ */ jsx(Box, { children: notesPath ? /* @__PURE__ */ jsx(Text, { color: C.muted, children: notesPath.replace(process.env.HOME, "~") }) : /* @__PURE__ */ jsx(Text, { color: C.muted, children: "type /new <name> to start" }) })
      ]
    }
  );
}
function getCursorPos(text, cursor) {
  const lines = text.split("\n");
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length;
    if (cursor <= lineEnd) {
      return { lineIdx: i, colIdx: cursor - pos, lines };
    }
    pos = lineEnd + 1;
  }
  const last = lines.length - 1;
  return { lineIdx: last, colIdx: lines[last].length, lines };
}
function MultiLineInput({ onSubmit, placeholder, isActive }) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const textRef = useRef(text);
  const cursorRef = useRef(cursor);
  const isActiveRef = useRef(isActive);
  const shiftEnterRef = useRef(false);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  useEffect(() => {
    const handler = (data) => {
      if (!isActiveRef.current) return;
      const seq = data.toString();
      if (seq === "\x1B[13;2u" || seq === "\x1B\r") {
        shiftEnterRef.current = true;
        Promise.resolve().then(() => {
          shiftEnterRef.current = false;
        });
        const cur = cursorRef.current;
        const txt = textRef.current;
        const newText = txt.slice(0, cur) + "\n" + txt.slice(cur);
        setText(newText);
        setCursor(cur + 1);
      }
    };
    process.stdin.prependListener("data", handler);
    return () => process.stdin.off("data", handler);
  }, []);
  useInput((ch, key) => {
    if (!isActive) return;
    if (shiftEnterRef.current) return;
    if (key.ctrl) return;
    if (key.return) {
      if (text.trim()) {
        onSubmit(text);
        setText("");
        setCursor(0);
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setText(text.slice(0, cursor - 1) + text.slice(cursor));
        setCursor(cursor - 1);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor(Math.max(0, cursor - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor(Math.min(text.length, cursor + 1));
      return;
    }
    if (key.upArrow) {
      const { lineIdx, colIdx, lines: lines2 } = getCursorPos(text, cursor);
      if (lineIdx > 0) {
        const prevLine = lines2[lineIdx - 1];
        const newCol = Math.min(colIdx, prevLine.length);
        let newPos = 0;
        for (let i = 0; i < lineIdx - 1; i++) newPos += lines2[i].length + 1;
        setCursor(newPos + newCol);
      }
      return;
    }
    if (key.downArrow) {
      const { lineIdx, colIdx, lines: lines2 } = getCursorPos(text, cursor);
      if (lineIdx < lines2.length - 1) {
        const nextLine = lines2[lineIdx + 1];
        const newCol = Math.min(colIdx, nextLine.length);
        let newPos = 0;
        for (let i = 0; i <= lineIdx; i++) newPos += lines2[i].length + 1;
        setCursor(newPos + newCol);
      }
      return;
    }
    if (ch && !ch.startsWith("\x1B")) {
      const newText = text.slice(0, cursor) + ch + text.slice(cursor);
      setText(newText);
      setCursor(cursor + 1);
    }
  });
  if (!text && placeholder) {
    return /* @__PURE__ */ jsx(Text, { color: C.muted, children: placeholder });
  }
  const { lineIdx: cursorLine, colIdx: cursorCol, lines } = getCursorPos(text, cursor);
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: lines.map((line, i) => {
    if (i === cursorLine) {
      const before = line.slice(0, cursorCol);
      const atCursor = line[cursorCol] ?? " ";
      const after = line.slice(cursorCol + 1);
      return /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { children: before }),
        /* @__PURE__ */ jsx(Text, { inverse: true, children: atCursor }),
        /* @__PURE__ */ jsx(Text, { children: after })
      ] }, i);
    }
    return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { children: line || " " }) }, i);
  }) });
}
var HELP_LINES = [
  { type: "info", text: "Commands:" },
  { type: "muted", text: "  /new <name>      Start a new meeting (pauses current if active)" },
  { type: "muted", text: "  /resume          Continue the last meeting from a previous session" },
  { type: "muted", text: "  /screenshot      Capture the previous window & embed in notes" },
  { type: "muted", text: "  /end             End meeting, generate AI summary, save & close" },
  { type: "muted", text: "  /status          Show current meeting info & file path" },
  { type: "muted", text: "  /help            Show this help" },
  { type: "muted", text: "  Ctrl+C / /quit   Exit (meeting stays resumable)" },
  { type: "divider", text: "" },
  { type: "muted", text: "  Any other text \u2192 appended as a timestamped note line" },
  { type: "muted", text: "  Shift+Enter     Insert a new line (multi-line note)" },
  { type: "muted", text: "  \u2191 \u2193 \u2190 \u2192         Navigate within multi-line input" }
];
function App() {
  const { exit } = useApp();
  const [lines, setLines] = useState([]);
  const [meeting, setMeeting] = useState(null);
  const [notesPath, setNotesPath] = useState(null);
  const [screenshotsDir, setScreenshotsDir] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [inputDisabled, setInputDisabled] = useState(false);
  useEffect(() => {
    process.stdout.write("\x1B[>1u");
    const restore = () => process.stdout.write("\x1B[<u");
    process.on("exit", restore);
    return () => {
      restore();
      process.off("exit", restore);
    };
  }, []);
  useEffect(() => {
    trackPreviousApp();
  }, []);
  const addLine = useCallback((type, text, ts = timeNow()) => {
    setLines((prev) => [...prev, { type, text, timestamp: ts, id: Date.now() + Math.random() }]);
  }, []);
  useEffect(() => {
    const t = timeNow();
    const session = loadSession();
    const bootLines = [
      { type: "system", text: "meeting notes  v1.0", timestamp: t, id: 1 },
      { type: "muted", text: `Notes saved to ~/meeting-notes/`, timestamp: t, id: 2 },
      { type: "divider", text: "", timestamp: t, id: 3 }
    ];
    if (session) {
      bootLines.push({ type: "warning", text: `Previous meeting found: "${session.meeting}"`, timestamp: t, id: 4 });
      bootLines.push({ type: "info", text: "Type /resume to continue it  \xB7  /new <name> to start fresh", timestamp: t, id: 5 });
    } else {
      bootLines.push({ type: "info", text: "Type /new <meeting name> to start  \xB7  /help for commands", timestamp: t, id: 4 });
    }
    setLines(bootLines);
  }, []);
  const handleSubmit = useCallback(async (value) => {
    const raw = value.trim();
    if (!raw) return;
    const ts = timeNow();
    if (raw === "/help") {
      HELP_LINES.forEach((l) => addLine(l.type, l.text, ts));
      return;
    }
    if (raw === "/quit" || raw === "/exit") {
      if (meeting && notesPath) {
        saveSession(meeting, notesPath, screenshotsDir);
        addLine("system", `Meeting "${meeting}" paused \u2014 resume it next time with /resume`, ts);
      }
      setTimeout(() => exit(), 300);
      return;
    }
    if (raw === "/resume") {
      const session = loadSession();
      if (!session) {
        addLine("warning", "No previous meeting to resume.", ts);
        return;
      }
      if (meeting && notesPath) {
        saveSession(meeting, notesPath, screenshotsDir);
        addLine("success", `Paused current meeting: "${meeting}"`, ts);
        addLine("divider", "", ts);
      }
      appendResumedToNotes(session.notesPath);
      setMeeting(session.meeting);
      setNotesPath(session.notesPath);
      setScreenshotsDir(session.screenshotsDir);
      clearSession();
      addLine("system", `Resumed: ${session.meeting}`, ts);
      addLine("muted", `File: ${session.notesPath.replace(process.env.HOME, "~")}`, ts);
      addLine("divider", "", ts);
      return;
    }
    if (raw === "/status") {
      if (meeting) {
        addLine("info", `Active meeting: ${meeting}`, ts);
        addLine("muted", `File: ${notesPath?.replace(process.env.HOME, "~")}`, ts);
      } else {
        addLine("warning", "No active meeting. Use /new <name> to start one.", ts);
      }
      return;
    }
    if (raw.startsWith("/new")) {
      const name = raw.slice(4).trim();
      if (!name) {
        addLine("error", "Usage: /new <meeting name>", ts);
        return;
      }
      if (meeting && notesPath) {
        finalizeNotes(notesPath);
        addLine("success", `Ended meeting: "${meeting}"`, ts);
        addLine("divider", "", ts);
      }
      try {
        const { meetingDir, screenshotsDir: ssDir } = createMeetingDir(name);
        const nPath = initNotesFile(meetingDir, name);
        setMeeting(name);
        setNotesPath(nPath);
        setScreenshotsDir(ssDir);
        addLine("system", `Started: ${name}`, ts);
        addLine("muted", `File: ${nPath.replace(process.env.HOME, "~")}`, ts);
        addLine("divider", "", ts);
      } catch (e) {
        addLine("error", `Could not create meeting: ${e.message}`, ts);
      }
      return;
    }
    if (raw === "/screenshot" || raw.startsWith("/screenshot")) {
      if (!meeting || !notesPath) {
        addLine("warning", "No active meeting. Use /new <name> first.", ts);
        return;
      }
      addLine("info", "Switching to previous window\u2026", ts);
      setInputDisabled(true);
      setStatusMsg("capturing\u2026");
      try {
        const info = await captureWindowScreenshot(screenshotsDir, meeting);
        appendScreenshotToNotes(notesPath, info);
        addLine("screenshot", `Captured from ${info.targetApp} \u2192 ${info.relativePath}`, ts);
        setStatusMsg(null);
      } catch (e) {
        addLine("error", `Screenshot failed: ${e.message}`, ts);
        addLine("muted", "Tip: Make sure a browser or Teams window is open.", ts);
        setStatusMsg(null);
      } finally {
        setInputDisabled(false);
      }
      return;
    }
    if (raw === "/end") {
      if (!meeting || !notesPath) {
        addLine("warning", "No active meeting to end.", ts);
        return;
      }
      addLine("info", "Ending meeting\u2026", ts);
      setInputDisabled(true);
      setStatusMsg("summarising\u2026");
      try {
        finalizeNotes(notesPath);
        const notesContent = readNotes(notesPath);
        addLine("muted", "Generating AI summary\u2026", ts);
        const summary = await summarizeMeetingNotes(notesContent);
        appendSummaryToNotes(notesPath, summary);
        addLine("divider", "", ts);
        addLine("summary", "AI Summary appended to notes:", ts);
        summary.split("\n").forEach((line) => {
          if (line.trim()) addLine("muted", `  ${line}`, ts);
        });
        addLine("divider", "", ts);
        addLine("success", `Meeting "${meeting}" saved \u2192 ${notesPath.replace(process.env.HOME, "~")}`, ts);
        clearSession();
        setMeeting(null);
        setNotesPath(null);
        setScreenshotsDir(null);
        setStatusMsg(null);
        addLine("info", "Type /new <name> to start a new meeting.", ts);
      } catch (e) {
        addLine("warning", `AI summary failed (${e.message}), saving notes without summary.`, ts);
        addLine("success", `Meeting "${meeting}" saved \u2192 ${notesPath.replace(process.env.HOME, "~")}`, ts);
        clearSession();
        setMeeting(null);
        setNotesPath(null);
        setScreenshotsDir(null);
        setStatusMsg(null);
      } finally {
        setInputDisabled(false);
      }
      return;
    }
    if (raw.startsWith("/")) {
      addLine("error", `Unknown command: ${raw.split(" ")[0]}  (type /help)`, ts);
      return;
    }
    if (!meeting || !notesPath) {
      addLine("warning", "No active meeting. Use /new <name> to start one.", ts);
      return;
    }
    const noteLines = raw.split("\n");
    const formatted = noteLines.map((line, i) => i === 0 ? `- ${line}` : `  ${line}`).join("\n") + "\n";
    appendToNotes(notesPath, formatted);
    noteLines.forEach((line) => addLine("note", line, ts));
  }, [meeting, notesPath, screenshotsDir, addLine, exit]);
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (meeting && notesPath) {
        finalizeNotes(notesPath);
      }
      exit();
    }
  });
  const promptColor = meeting ? C.green : C.muted;
  const promptSymbol = meeting ? "\u276F" : "\u25CB";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
    /* @__PURE__ */ jsx(Static, { items: lines, children: (line) => /* @__PURE__ */ jsx(LogLine, { line }, line.id) }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1 }),
    /* @__PURE__ */ jsx(
      StatusBar,
      {
        meeting,
        notesPath,
        status: statusMsg
      }
    ),
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, paddingY: 0, children: [
      /* @__PURE__ */ jsxs(Text, { color: promptColor, bold: true, children: [
        promptSymbol,
        " "
      ] }),
      /* @__PURE__ */ jsx(
        MultiLineInput,
        {
          onSubmit: handleSubmit,
          placeholder: meeting ? "type a note\u2026 (Shift+Enter for new line)" : "/new <meeting name>",
          isActive: !inputDisabled
        }
      )
    ] })
  ] });
}

// index.js
render(React2.createElement(App), { exitOnCtrlC: false });
