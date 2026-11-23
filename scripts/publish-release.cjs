// Run only in the release workflow. Uses its short-lived repository token.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
const api = route => JSON.parse(gh('api', route));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const version = require('../package.json').version;
const tag = `v${version}`;
const repo = process.env.GH_REPO;
if (process.env.GITHUB_ACTIONS !== 'true' || repo !== 'LysBringer/Solsiden') {
  throw new Error('Publishing is only supported in the Solsiden release workflow.');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable release version is required.');
if (process.env.GITHUB_REF !== 'refs/heads/main' && process.env.GITHUB_REF !== `refs/tags/${tag}`) {
  throw new Error('Run from main, or from a tag matching package.json.');
}
const notes = `releases/${tag}.md`;
if (!fs.existsSync(notes)) throw new Error(`Missing release notes: ${notes}`);
// Paginate before any mutation; an API error must never look like an empty list.
const releases = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`)).flat();
const compare = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
if (releases.some(r => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name) && compare(r.tag_name.slice(1), version) > 0)) {
  throw new Error('A newer release already exists; refusing to replace it.');
}
const existing = releases.find(r => r.tag_name === tag);
if (existing && !existing.draft) throw new Error('This version is already published. Choose a new version.');
const source = `release/Solside-Setup-${version}-x64.exe`;
if (fs.statSync(source).size < 1024 * 1024) throw new Error('Installer is unexpectedly small.');
// A fixed asset name provides a stable /releases/latest/download/ URL.
const installer = 'release/Solside-Setup-x64.exe';
fs.copyFileSync(source, installer);
const hash = digest(installer);
fs.writeFileSync('release/SHA256SUMS.txt', `${hash}  ${path.basename(installer)}\n`);
if (!existing) {
  gh('release', 'create', tag, '--draft', '--target', process.env.GITHUB_SHA,
    '--title', `Solside ${tag}`, '--notes-file', notes);
}
gh('release', 'upload', tag, installer, 'release/SHA256SUMS.txt', '--clobber');
const verifyDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'solsiden-verify-'));
gh('release', 'download', tag, '--pattern', 'Solside-Setup-x64.exe', '--dir', verifyDir);
if (digest(path.join(verifyDir, 'Solside-Setup-x64.exe')) !== hash) throw new Error('Uploaded installer checksum mismatch.');
gh('release', 'edit', tag, '--draft=false', '--latest', '--notes-file', notes);
const latest = api(`repos/${repo}/releases/latest`);
if (latest.tag_name !== tag || !latest.assets.some(a => a.name === 'Solside-Setup-x64.exe' && a.state === 'uploaded')) {
  throw new Error('New release is not available as latest; old assets have been retained.');
}
// Keep historical source tags and release notes, but only the latest installer assets.
for (const release of releases) {
  if (release.tag_name === tag || release.draft || release.prerelease ||
      !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || compare(release.tag_name.slice(1), version) >= 0) continue;
  for (const asset of release.assets) {
    if (/^Solside-Setup-.*\.exe(?:\.blockmap)?$/.test(asset.name) || ['SHA256SUMS.txt', 'latest.yml'].includes(asset.name)) {
      gh('release', 'delete-asset', release.tag_name, asset.name, '--yes');
    }
  }
}
console.log(`Published ${tag}: https://github.com/${repo}/releases/latest`);

