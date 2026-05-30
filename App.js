import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, Static } from 'ink';
import { createMeetingDir, initNotesFile, appendToNotes, appendScreenshotToNotes, appendSummaryToNotes, finalizeNotes, readNotes, getNotesDir, saveSession, loadSession, clearSession, appendResumedToNotes } from './notes.js';
import { captureWindowScreenshot, trackPreviousApp, parseRegion } from './screenshot.js';
import { summarizeMeetingNotes } from './ai.js';

// ─── Colour palette (Claude Code-inspired dark terminal) ──────────────────────
const C = {
  accent:    '#A78BFA', // violet
  green:     '#4ADE80',
  yellow:    '#FACC15',
  red:       '#F87171',
  blue:      '#60A5FA',
  muted:     '#6B7280',
  dimmed:    '#4B5563',
  white:     '#F9FAFB',
  bg:        '#111827',
  border:    '#374151',
  timestamp: '#9CA3AF',
};

// ─── Helper: current time string ─────────────────────────────────────────────
function timeNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ─── A single output line in the scrollback ──────────────────────────────────
function LogLine({ line }) {
  const { type, text, timestamp } = line;

  const colorMap = {
    system:    C.accent,
    info:      C.blue,
    success:   C.green,
    error:     C.red,
    warning:   C.yellow,
    note:      C.white,
    screenshot:C.green,
    summary:   C.accent,
    muted:     C.muted,
    divider:   C.border,
  };

  const color = colorMap[type] || C.white;
  const prefix = {
    system:     '◆',
    info:       '·',
    success:    '✓',
    error:      '✗',
    warning:    '⚠',
    note:       '│',
    screenshot: '📸',
    summary:    '✦',
    muted:      ' ',
    divider:    '─',
  }[type] || '·';

  if (type === 'divider') {
    return (
      <Box>
        <Text color={C.dimmed}>{'─'.repeat(60)}</Text>
      </Box>
    );
  }

  return (
    <Box>
      {type !== 'note' && <Text color={C.muted}>{timestamp} </Text>}
      <Text color={color}>{prefix} </Text>
      <Text color={color}>{text}</Text>
    </Box>
  );
}

// ─── Status bar at the bottom ────────────────────────────────────────────────
function StatusBar({ meeting, notesPath, status }) {
  const meetingLabel = meeting
    ? <Text color={C.green}>● <Text color={C.white} bold>{meeting}</Text></Text>
    : <Text color={C.muted}>○ no active meeting</Text>;

  const statusLabel = status
    ? <Text color={C.yellow}> {status}</Text>
    : null;

  return (
    <Box
      borderStyle="single"
      borderColor={C.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={2}>
        <Text color={C.accent} bold>notes</Text>
        <Text color={C.dimmed}>│</Text>
        {meetingLabel}
        {statusLabel}
      </Box>
      <Box>
        {notesPath
          ? <Text color={C.muted}>{notesPath.replace(process.env.HOME, '~')}</Text>
          : <Text color={C.muted}>type /new &lt;name&gt; to start</Text>
        }
      </Box>
    </Box>
  );
}

// ─── Multi-line text input ────────────────────────────────────────────────────
function getCursorPos(text, cursor) {
  const lines = text.split('\n');
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
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);

  // Refs so the raw stdin handler always sees current values
  const textRef = useRef(text);
  const cursorRef = useRef(cursor);
  const isActiveRef = useRef(isActive);
  const shiftEnterRef = useRef(false); // flag to suppress ink's spurious key.return
  // Command history (newest first), index into it, and draft saved before navigating
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);
  const draftRef = useRef('');
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // Use prependListener so our handler fires BEFORE ink's own stdin handler.
  // ink processes the same data event synchronously and would otherwise insert
  // the raw escape sequence characters as text before we get a chance to handle it.
  useEffect(() => {
    const handler = (data) => {
      if (!isActiveRef.current) return;
      const seq = data.toString();
      // Kitty protocol Shift+Enter  (\x1b[13;2u)  — enabled via \x1b[>1u at startup
      // iTerm2 Option+Enter         (\x1b\r)
      if (seq === '\x1b[13;2u' || seq === '\x1b\r') {
        // Keep the flag true for the entire synchronous processing tick so that
        // ALL useInput calls ink makes for this data event are suppressed.
        shiftEnterRef.current = true;
        Promise.resolve().then(() => { shiftEnterRef.current = false; });

        const cur = cursorRef.current;
        const txt = textRef.current;
        const newText = txt.slice(0, cur) + '\n' + txt.slice(cur);
        setText(newText);
        setCursor(cur + 1);
      }
    };
    process.stdin.prependListener('data', handler);
    return () => process.stdin.off('data', handler);
  }, []);

  useInput((ch, key) => {
    if (!isActive) return;

    // Suppress ALL input processing when our raw handler just handled Shift+Enter.
    // ink may call useInput multiple times (once per parsed token) for the same
    // data event, so we keep the flag set until the microtask resets it.
    if (shiftEnterRef.current) return;

    if (key.ctrl) return; // let App-level handlers deal with Ctrl combos

    if (key.return) {
      if (text.trim()) {
        historyRef.current = [text, ...historyRef.current];
        historyIdxRef.current = -1;
        draftRef.current = '';
        onSubmit(text);
        setText('');
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
      const { lineIdx, colIdx, lines } = getCursorPos(text, cursor);
      if (lineIdx > 0) {
        const prevLine = lines[lineIdx - 1];
        const newCol = Math.min(colIdx, prevLine.length);
        let newPos = 0;
        for (let i = 0; i < lineIdx - 1; i++) newPos += lines[i].length + 1;
        setCursor(newPos + newCol);
      } else {
        // On first line — navigate history backward
        const history = historyRef.current;
        if (history.length > 0) {
          if (historyIdxRef.current === -1) draftRef.current = text;
          const newIdx = Math.min(historyIdxRef.current + 1, history.length - 1);
          historyIdxRef.current = newIdx;
          const entry = history[newIdx];
          setText(entry);
          setCursor(entry.length);
        }
      }
      return;
    }

    if (key.downArrow) {
      const { lineIdx, colIdx, lines } = getCursorPos(text, cursor);
      if (lineIdx < lines.length - 1) {
        const nextLine = lines[lineIdx + 1];
        const newCol = Math.min(colIdx, nextLine.length);
        let newPos = 0;
        for (let i = 0; i <= lineIdx; i++) newPos += lines[i].length + 1;
        setCursor(newPos + newCol);
      } else {
        // On last line — navigate history forward
        if (historyIdxRef.current > -1) {
          const newIdx = historyIdxRef.current - 1;
          historyIdxRef.current = newIdx;
          const entry = newIdx === -1 ? draftRef.current : historyRef.current[newIdx];
          setText(entry);
          setCursor(entry.length);
        }
      }
      return;
    }

    // Ignore escape sequences that leaked through (e.g. unrecognised CSI)
    if (ch && !ch.startsWith('\x1b')) {
      const newText = text.slice(0, cursor) + ch + text.slice(cursor);
      setText(newText);
      setCursor(cursor + 1);
    }
  });

  if (!text && placeholder) {
    return <Text color={C.muted}>{placeholder}</Text>;
  }

  const { lineIdx: cursorLine, colIdx: cursorCol, lines } = getCursorPos(text, cursor);

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        if (i === cursorLine) {
          const before = line.slice(0, cursorCol);
          const atCursor = line[cursorCol] ?? ' ';
          const after = line.slice(cursorCol + 1);
          return (
            <Box key={i}>
              <Text>{before}</Text>
              <Text inverse>{atCursor}</Text>
              <Text>{after}</Text>
            </Box>
          );
        }
        return <Box key={i}><Text>{line || ' '}</Text></Box>;
      })}
    </Box>
  );
}

// ─── Help text ────────────────────────────────────────────────────────────────
const HELP_LINES = [
  { type: 'info',   text: 'Commands:' },
  { type: 'muted',  text: '  /new <name>      Start a new meeting (pauses current if active)' },
  { type: 'muted',  text: '  /resume          Continue the last meeting from a previous session' },
  { type: 'muted',  text: '  /screenshot               Capture full screen & embed in notes' },
  { type: 'muted',  text: '  /screenshot x1,y1 - x2,y2 Capture a specific region' },
  { type: 'muted',  text: '  /end             End meeting, generate AI summary, save & close' },
  { type: 'muted',  text: '  /status          Show current meeting info & file path' },
  { type: 'muted',  text: '  /help            Show this help' },
  { type: 'muted',  text: '  Ctrl+C / /quit   Exit (meeting stays resumable)' },
  { type: 'divider',text: '' },
  { type: 'muted',  text: '  Any other text → appended as a timestamped note line' },
  { type: 'muted',  text: '  Shift+Enter     Insert a new line (multi-line note)' },
  { type: 'muted',  text: '  ↑ ↓ ← →         Navigate within multi-line input' },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { exit } = useApp();
  const [lines, setLines]             = useState([]);
  const [meeting, setMeeting]         = useState(null);       // meeting name string
  const [notesPath, setNotesPath]     = useState(null);
  const [screenshotsDir, setScreenshotsDir] = useState(null);
  const [statusMsg, setStatusMsg]     = useState(null);
  const [inputDisabled, setInputDisabled] = useState(false);

  // Enable Kitty keyboard protocol so terminals like Ghostty send distinct
  // escape sequences for modifier+key combos (e.g. Shift+Enter = \x1b[13;2u).
  // Without this, Shift+Enter is indistinguishable from plain Enter.
  useEffect(() => {
    process.stdout.write('\x1b[>1u'); // push: enable disambiguate escape codes
    const restore = () => process.stdout.write('\x1b[<u'); // pop on exit
    process.on('exit', restore);
    return () => {
      restore();
      process.off('exit', restore);
    };
  }, []);

  // Track previous app for screenshots
  useEffect(() => {
    trackPreviousApp();
  }, []);

  const addLine = useCallback((type, text, ts = timeNow()) => {
    setLines(prev => [...prev, { type, text, timestamp: ts, id: Date.now() + Math.random() }]);
  }, []);

  // Boot message + previous session detection
  useEffect(() => {
    const t = timeNow();
    const session = loadSession();
    const bootLines = [
      { type: 'system',  text: 'meeting notes  v1.0', timestamp: t, id: 1 },
      { type: 'muted',   text: `Notes saved to ~/meeting-notes/`, timestamp: t, id: 2 },
      { type: 'divider', text: '', timestamp: t, id: 3 },
    ];
    if (session) {
      bootLines.push({ type: 'warning', text: `Previous meeting found: "${session.meeting}"`, timestamp: t, id: 4 });
      bootLines.push({ type: 'info',    text: 'Type /resume to continue it  ·  /new <name> to start fresh', timestamp: t, id: 5 });
    } else {
      bootLines.push({ type: 'info',    text: 'Type /new <meeting name> to start  ·  /help for commands', timestamp: t, id: 4 });
    }
    setLines(bootLines);
  }, []);

  // ── Command handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (value) => {
    const raw = value.trim();
    if (!raw) return;

    const ts = timeNow();

    // ── /help ──────────────────────────────────────────────────────────────
    if (raw === '/help') {
      HELP_LINES.forEach(l => addLine(l.type, l.text, ts));
      return;
    }

    // ── /quit ──────────────────────────────────────────────────────────────
    if (raw === '/quit' || raw === '/exit') {
      if (meeting && notesPath) {
        saveSession(meeting, notesPath, screenshotsDir);
        addLine('system', `Meeting "${meeting}" paused — resume it next time with /resume`, ts);
      }
      setTimeout(() => exit(), 300);
      return;
    }

    // ── /resume ────────────────────────────────────────────────────────────
    if (raw === '/resume') {
      const session = loadSession();
      if (!session) {
        addLine('warning', 'No previous meeting to resume.', ts);
        return;
      }
      if (meeting && notesPath) {
        saveSession(meeting, notesPath, screenshotsDir);
        addLine('success', `Paused current meeting: "${meeting}"`, ts);
        addLine('divider', '', ts);
      }
      appendResumedToNotes(session.notesPath);
      setMeeting(session.meeting);
      setNotesPath(session.notesPath);
      setScreenshotsDir(session.screenshotsDir);
      clearSession();
      addLine('system', `Resumed: ${session.meeting}`, ts);
      addLine('muted', `File: ${session.notesPath.replace(process.env.HOME, '~')}`, ts);
      addLine('divider', '', ts);
      return;
    }

    // ── /status ────────────────────────────────────────────────────────────
    if (raw === '/status') {
      if (meeting) {
        addLine('info', `Active meeting: ${meeting}`, ts);
        addLine('muted', `File: ${notesPath?.replace(process.env.HOME, '~')}`, ts);
      } else {
        addLine('warning', 'No active meeting. Use /new <name> to start one.', ts);
      }
      return;
    }

    // ── /new ───────────────────────────────────────────────────────────────
    if (raw.startsWith('/new')) {
      const name = raw.slice(4).trim();
      if (!name) {
        addLine('error', 'Usage: /new <meeting name>', ts);
        return;
      }

      // End current meeting if one is active
      if (meeting && notesPath) {
        finalizeNotes(notesPath);
        addLine('success', `Ended meeting: "${meeting}"`, ts);
        addLine('divider', '', ts);
      }

      try {
        const { meetingDir, screenshotsDir: ssDir } = createMeetingDir(name);
        const nPath = initNotesFile(meetingDir, name);
        setMeeting(name);
        setNotesPath(nPath);
        setScreenshotsDir(ssDir);
        addLine('system', `Started: ${name}`, ts);
        addLine('muted', `File: ${nPath.replace(process.env.HOME, '~')}`, ts);
        addLine('divider', '', ts);
      } catch (e) {
        addLine('error', `Could not create meeting: ${e.message}`, ts);
      }
      return;
    }

    // ── /screenshot ────────────────────────────────────────────────────────
    if (raw === '/screenshot' || raw.startsWith('/screenshot') || raw === '/ss' || raw.startsWith('/ss ')) {
      if (!meeting || !notesPath) {
        addLine('warning', 'No active meeting. Use /new <name> first.', ts);
        return;
      }

      const cmdLen = raw.startsWith('/ss') ? '/ss'.length : '/screenshot'.length;
      const regionArgs = raw.slice(cmdLen).trim();
      const region = parseRegion(regionArgs);

      if (regionArgs && !region) {
        addLine('error', 'Bad format. Use: /screenshot 450,200 - 1350,850', ts);
        return;
      }

      setInputDisabled(true);

      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      addLine('info', 'Switch to Chrome now — capturing in 3…', ts);
      await sleep(1000);
      addLine('info', '2…', ts);
      await sleep(1000);
      addLine('info', '1…', ts);
      await sleep(1000);

      setStatusMsg('capturing…');

      try {
        const info = await captureWindowScreenshot(screenshotsDir, region);
        appendScreenshotToNotes(notesPath, info);
        const regionNote = region ? ` [${region.w}×${region.h}]` : '';
        addLine('screenshot', `Captured${regionNote} → ${info.relativePath}`, ts);
        setStatusMsg(null);
      } catch (e) {
        addLine('error', `Screenshot failed: ${e.message}`, ts);
        setStatusMsg(null);
      } finally {
        setInputDisabled(false);
      }
      return;
    }

    // ── /end ───────────────────────────────────────────────────────────────
    if (raw === '/end') {
      if (!meeting || !notesPath) {
        addLine('warning', 'No active meeting to end.', ts);
        return;
      }

      addLine('info', 'Ending meeting…', ts);
      setInputDisabled(true);
      setStatusMsg('summarising…');

      try {
        finalizeNotes(notesPath);
        const notesContent = readNotes(notesPath);

        addLine('muted', 'Generating AI summary…', ts);
        const summary = await summarizeMeetingNotes(notesContent);
        appendSummaryToNotes(notesPath, summary);

        addLine('divider', '', ts);
        addLine('summary', 'AI Summary appended to notes:', ts);
        // Print summary lines
        summary.split('\n').forEach(line => {
          if (line.trim()) addLine('muted', `  ${line}`, ts);
        });
        addLine('divider', '', ts);
        addLine('success', `Meeting "${meeting}" saved → ${notesPath.replace(process.env.HOME, '~')}`, ts);

        clearSession();
        setMeeting(null);
        setNotesPath(null);
        setScreenshotsDir(null);
        setStatusMsg(null);
        addLine('info', 'Type /new <name> to start a new meeting.', ts);
      } catch (e) {
        // If AI fails, still end the meeting
        addLine('warning', `AI summary failed (${e.message}), saving notes without summary.`, ts);
        addLine('success', `Meeting "${meeting}" saved → ${notesPath.replace(process.env.HOME, '~')}`, ts);
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

    // ── Unknown slash command ──────────────────────────────────────────────
    if (raw.startsWith('/')) {
      addLine('error', `Unknown command: ${raw.split(' ')[0]}  (type /help)`, ts);
      return;
    }

    // ── Plain note text ────────────────────────────────────────────────────
    if (!meeting || !notesPath) {
      addLine('warning', 'No active meeting. Use /new <name> to start one.', ts);
      return;
    }

    const noteLines = raw.split('\n');
    const formatted = noteLines
      .map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`))
      .join('\n') + '\n';
    appendToNotes(notesPath, formatted);
    noteLines.forEach(line => addLine('note', line, ts));

  }, [meeting, notesPath, screenshotsDir, addLine, exit]);

  // Ctrl+C handler
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (meeting && notesPath) {
        finalizeNotes(notesPath);
      }
      exit();
    }
  });

  const promptColor = meeting ? C.green : C.muted;
  const promptSymbol = meeting ? '❯' : '○';

  return (
    <Box flexDirection="column" width="100%">
      {/* Scrollback log */}
      <Static items={lines}>
        {(line) => <LogLine key={line.id} line={line} />}
      </Static>

      {/* Spacer */}
      <Box marginTop={1} />

      {/* Status bar */}
      <StatusBar
        meeting={meeting}
        notesPath={notesPath}
        status={statusMsg}
      />

      {/* Input row */}
      <Box paddingX={1} paddingY={0}>
        <Text color={promptColor} bold>{promptSymbol} </Text>
        <MultiLineInput
          onSubmit={handleSubmit}
          placeholder={meeting ? 'type a note… (Shift+Enter for new line)' : '/new <meeting name>'}
          isActive={!inputDisabled}
        />
      </Box>
    </Box>
  );
}
