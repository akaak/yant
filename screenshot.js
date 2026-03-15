import { execSync, exec } from 'child_process';
import path from 'path';
import fs from 'fs';

// Get the window ID of the frontmost app (before terminal takes focus)
// We store the previous app's window info when the terminal starts
let previousAppName = null;
let previousWindowId = null;

export function trackPreviousApp() {
  try {
    // Use AppleScript to get the frontmost app name
    const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
    const result = execSync(`osascript -e '${script}'`, { timeout: 3000 }).toString().trim();
    if (result && result !== 'Terminal' && result !== 'iTerm2' && result !== 'iTerm') {
      previousAppName = result;
    }
  } catch (e) {
    // Silently fail - not critical
  }
}

export async function captureWindowScreenshot(screenshotsDir, meetingName) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `screenshot-${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Step 1: Find the best window to capture
    // Try to find a browser or Teams window using AppleScript
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
      targetApp = execSync(`osascript -e '${findWindowScript.replace(/\n/g, ' ')}'`, {
        timeout: 3000
      }).toString().trim();
    } catch (e) {
      targetApp = null;
    }

    if (!targetApp) {
      // Fallback: use stored previous app
      targetApp = previousAppName;
    }

    if (!targetApp) {
      reject(new Error('No target app found. Make sure a browser or Teams window is open.'));
      return;
    }

    // Step 2: Bring target app to front, screenshot, return focus to terminal
    const captureScript = `
      tell application "${targetApp}"
        activate
      end tell
      delay 0.4
    `;

    exec(`osascript -e '${captureScript.replace(/\n/g, '\n')}'`, { timeout: 5000 }, (err) => {
      // Step 3: Take screenshot of frontmost window using screencapture
      // -l flag captures a specific window by window ID
      // -o removes the shadow
      // Using -x for no sound, -t png for format

      // Get the window ID of the now-focused app
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
        windowId = execSync(`osascript -e '${getWindowIdScript.replace(/\n/g, ' ')}'`, {
          timeout: 3000
        }).toString().trim();
      } catch (e) {
        windowId = null;
      }

      let screencaptureCmd;
      if (windowId && windowId !== '') {
        // Capture specific window by ID
        screencaptureCmd = `screencapture -x -o -l ${windowId} "${filepath}"`;
      } else {
        // Fallback: capture entire screen
        screencaptureCmd = `screencapture -x "${filepath}"`;
      }

      exec(screencaptureCmd, { timeout: 5000 }, (captureErr) => {
        // Step 4: Return focus to Terminal
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

        exec(`osascript -e '${returnFocusScript.replace(/\n/g, ' ')}'`, { timeout: 3000 }, () => {
          if (captureErr) {
            reject(new Error(`Screenshot failed: ${captureErr.message}`));
            return;
          }

          if (!fs.existsSync(filepath)) {
            reject(new Error('Screenshot file was not created'));
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
