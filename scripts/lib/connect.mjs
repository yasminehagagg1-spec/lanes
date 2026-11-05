// Helpers for connect-claude.sh (plain Node, no dependencies).
//   node connect.mjs desktop-config <configPath> <node> <entry> <lanesUrl> [--dry-run]
//   node connect.mjs desktop-skill  <SKILL.md in> <SKILL.md out>
import fs from 'node:fs';

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'desktop-config') {
  const [file, node, entry, url, flag] = args;
  const dry = flag === '--dry-run';
  let config = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    try {
      config = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      console.error(
        `  ✗ ${file} isn't valid JSON. Left it alone; fix it in Claude → Settings → Developer.`,
      );
      process.exit(2);
    }
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    console.error(`  ✗ ${file} doesn't hold a JSON object. Left it alone.`);
    process.exit(2);
  }
  const wanted = { command: node, args: [entry], env: { LANES_URL: url } };
  const servers = config.mcpServers ?? {};
  const before = servers.lanes;
  if (JSON.stringify(before) === JSON.stringify(wanted)) {
    console.log('  = Claude desktop: "lanes" entry already up to date.');
    process.exit(0);
  }
  // Read-modify-write: only the "lanes" entry changes; every other key stays as it was.
  const next = { ...config, mcpServers: { ...servers, lanes: wanted } };
  const verb = before ? 'updated' : 'added';
  if (dry) {
    console.log(`  ~ Claude desktop: would have ${verb} "lanes" in ${file}`);
    process.exit(0);
  }
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, `${file}.lanes-backup-${stamp}`);
    console.log(`  · backup: ${file}.lanes-backup-${stamp}`);
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  const others = Object.keys(servers).filter((k) => k !== 'lanes');
  console.log(
    `  ✓ Claude desktop: ${verb} "lanes" (other servers kept: ${others.join(', ') || 'none'}).`,
  );
} else if (cmd === 'desktop-skill') {
  // The desktop app takes only name + description in frontmatter and has no $ARGUMENTS.
  const [src, out] = args;
  const text = fs.readFileSync(src, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('SKILL.md has no frontmatter');
  const keep = m[1].split('\n').filter((l) => /^(name|description):/.test(l));
  const body = text
    .slice(m[0].length)
    .replace(
      'Add this to Lanes: $ARGUMENTS',
      'Add the task in the user’s /task message (everything after “/task”) to Lanes.',
    )
    .replace(/<!-- lanes-skill:.*-->\n\n?/, '');
  fs.writeFileSync(out, `---\n${keep.join('\n')}\n---\n${body}`);
} else {
  console.error('usage: connect.mjs desktop-config|desktop-skill …');
  process.exit(1);
}
