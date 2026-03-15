import fs from 'fs';
import path from 'path';
import os from 'os';

const NOTES_BASE_DIR = path.join(os.homedir(), 'meeting-notes');

export function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
}

export function createMeetingDir(meetingName) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safeName = sanitizeName(meetingName);
  const dirName = `${date}-${safeName}`;
  const meetingDir = path.join(NOTES_BASE_DIR, dirName);
  const screenshotsDir = path.join(meetingDir, 'screenshots');

  fs.mkdirSync(meetingDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  return { meetingDir, screenshotsDir, dirName };
}

export function initNotesFile(meetingDir, meetingName) {
  const notesPath = path.join(meetingDir, 'notes.md');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const header = `## ${dateStr} >> ${meetingName}\n\n**Started:** ${timeStr}\n\n---\n\n`;
  fs.writeFileSync(notesPath, header, 'utf8');
  return notesPath;
}

export function appendToNotes(notesPath, text) {
  fs.appendFileSync(notesPath, text, 'utf8');
}

export function appendScreenshotToNotes(notesPath, screenshotInfo) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = `\n> 📸 **Screenshot** · ${timeStr} · from *${screenshotInfo.targetApp}*\n\n![Screenshot](${screenshotInfo.relativePath})\n\n`;
  fs.appendFileSync(notesPath, entry, 'utf8');
}

export function appendSummaryToNotes(notesPath, summary) {
  const divider = `\n\n---\n\n## 🤖 AI Summary\n\n${summary}\n`;
  fs.appendFileSync(notesPath, divider, 'utf8');
}

export function finalizeNotes(notesPath) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  fs.appendFileSync(notesPath, `\n\n---\n\n**Ended:** ${timeStr}\n`, 'utf8');
}

export function readNotes(notesPath) {
  if (!fs.existsSync(notesPath)) return '';
  return fs.readFileSync(notesPath, 'utf8');
}

export function getNotesDir() {
  return NOTES_BASE_DIR;
}
