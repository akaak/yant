import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export function trackPreviousApp() {}

// Parse "x1,y1 - x2,y2" into a -R flag string, or null for full screen.
export function parseRegion(args) {
  if (!args) return null;
  const m = args.match(/(\d+)\s*,\s*(\d+)\s*-\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  const [x, y, x2, y2] = [+m[1], +m[2], +m[3], +m[4]];
  return { x, y, w: x2 - x, h: y2 - y };
}

export async function captureWindowScreenshot(screenshotsDir, region = null) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename  = `screenshot-${timestamp}.png`;
    const filepath  = path.join(screenshotsDir, filename);

    fs.mkdirSync(screenshotsDir, { recursive: true });

    const regionFlag = region ? `-R ${region.x},${region.y},${region.w},${region.h}` : '';
    exec(`screencapture -x ${regionFlag} "${filepath}"`, { timeout: 5000 }, (captureErr) => {
      // Return focus to the terminal
      const returnScript = `
        tell application "System Events"
          repeat with termApp in {"Ghostty","Terminal","iTerm2","iTerm","Alacritty","Warp","Hyper","kitty","WezTerm"}
            if exists (application process termApp) then
              tell application process termApp to set frontmost to true
              exit repeat
            end if
          end repeat
        end tell
      `;
      exec(`osascript -e '${returnScript.replace(/\n/g, ' ')}'`, { timeout: 3000 }, () => {
        if (captureErr) {
          reject(new Error(`screencapture failed: ${captureErr.message}`));
          return;
        }
        if (!fs.existsSync(filepath)) {
          reject(new Error('Screenshot file was not created'));
          return;
        }
        resolve({ filename, filepath, relativePath: `screenshots/${filename}`, targetApp: 'Chrome' });
      });
    });
  });
}
