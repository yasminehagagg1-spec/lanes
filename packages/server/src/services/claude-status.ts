// Is Lanes connected to Claude? Read-only look at the Claude config files on this Mac.
import fs from 'node:fs';
import path from 'node:path';

export interface ClaudeStatus {
  /** null: the app isn't installed. */
  desktop: boolean | null;
  /** null: Claude Code isn't installed. */
  code: boolean | null;
  skill: boolean;
  /** Last call from the Lanes connector since the server started. */
  lastSeenAt: string | null;
  tokenPath: string;
}

function hasLanes(file: string): boolean | null {
  if (!fs.existsSync(file)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      mcpServers?: Record<string, unknown>;
    };
    return Boolean(json.mcpServers?.lanes);
  } catch {
    return false;
  }
}

export function claudeStatus(opts: {
  home: string;
  dataDir: string;
  lastSeenAt: string | null;
}): ClaudeStatus {
  const desktopDir = path.join(opts.home, 'Library', 'Application Support', 'Claude');
  const skillFile = path.join(opts.home, '.claude', 'skills', 'task', 'SKILL.md');
  return {
    desktop: fs.existsSync(desktopDir)
      ? (hasLanes(path.join(desktopDir, 'claude_desktop_config.json')) ?? false)
      : null,
    code: hasLanes(path.join(opts.home, '.claude.json')),
    skill: fs.existsSync(skillFile) && fs.readFileSync(skillFile, 'utf8').includes('lanes-skill:'),
    lastSeenAt: opts.lastSeenAt,
    tokenPath: path.join(opts.dataDir, 'token'),
  };
}
