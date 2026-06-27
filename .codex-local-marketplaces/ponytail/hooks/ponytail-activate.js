#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { getDefaultMode, getClaudeDir, isShellSafe } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');
const { clearMode, isCodex, isCopilot, setMode, writeHookOutput } = require('./ponytail-runtime');

const claudeDir = getClaudeDir();
const settingsPath = path.join(claudeDir, 'settings.json');
const mode = getDefaultMode();

if (mode === 'off') {
  clearMode();
  const hookOutput = isCodex || isCopilot ? '' : 'OK';
  writeHookOutput('SessionStart', 'off', hookOutput);
  process.exit(0);
}

try {
  setMode(mode);
} catch {}

let output = getPonytailInstructions(mode);

if (!isCodex && !isCopilot) {
  try {
    let hasStatusline = false;
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
      const settings = JSON.parse(raw);
      hasStatusline = Boolean(settings.statusLine);
    }

    if (!hasStatusline) {
      const isWindows = process.platform === 'win32';
      const scriptName = isWindows ? 'ponytail-statusline.ps1' : 'ponytail-statusline.sh';
      const scriptPath = path.join(__dirname, scriptName);

      if (isShellSafe(scriptPath)) {
        const command = isWindows
          ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
          : `bash "${scriptPath}"`;
        const statusLineSnippet =
          '"statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' }';

        output +=
          '\n\nSTATUSLINE SETUP NEEDED: add this to ~/.claude/settings.json: ' +
          statusLineSnippet +
          '. Offer to set it up for the user.';
      } else {
        output +=
          '\n\nSTATUSLINE SETUP NEEDED: install path is not shell-safe; configure the statusLine command manually from the plugin hooks directory.';
      }
    }
  } catch {}
}

try {
  writeHookOutput('SessionStart', mode, output);
} catch {}
