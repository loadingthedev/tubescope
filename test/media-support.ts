import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const FFMPEG = ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'].find(f => fs.existsSync(f));
let filters = '', help = '';
if (FFMPEG) {
  filters = execFileSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  help = execFileSync(FFMPEG, ['-hide_banner', '-h', 'full'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 5e6 });
}
export const HAS_DRAWTEXT = /\bdrawtext\b/.test(filters);
export const CAN_RENDER = HAS_DRAWTEXT && /-filter_complex_script\b/.test(help);
export const RENDER_SKIP = CAN_RENDER ? false : 'Installed ffmpeg lacks drawtext or filter_complex_script';
