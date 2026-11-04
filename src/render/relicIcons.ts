import Phaser from 'phaser';
import { RELIC_IDS, RELICS, type RelicId } from '../sim/relics';

/** 14x14 relic icons: an amulet for charms, a cut stone for the rest, in the relic's colour (k border, l light, c colour, d shade). */
const CHARM = [
  '....kkkkkk....',
  '...k......k...',
  '..k........k..',
  '..k........k..',
  '...k......k...',
  '....kkkkkk....',
  '.....kddk.....',
  '....kcllck....',
  '...kcllccck...',
  '...kclcccdk...',
  '...kccccddk...',
  '....kccddk....',
  '.....kddk.....',
  '......kk......',
];
const STONE = [
  '..............',
  '.....kkkk.....',
  '....kllcck....',
  '...kllcccck...',
  '..kllccccddk..',
  '.kllccccccddk.',
  '.klcccccccddk.',
  '.kcccccccdddk.',
  '..kccccccddk..',
  '...kccccddk...',
  '....kcccdk....',
  '.....kcdk.....',
  '......kk......',
  '..............',
];

export function relicIcon(id: RelicId): string {
  return `icon-relic-${id}`;
}

/** Draw every relic's icon once. */
export function ensureRelicIcons(scene: Phaser.Scene): void {
  for (const id of RELIC_IDS) {
    const key = relicIcon(id);
    if (scene.textures.exists(key)) continue;
    const def = RELICS[id];
    const rows = def.charm ? CHARM : STONE;
    const base = Phaser.Display.Color.IntegerToColor(def.color);
    const css = (c: Phaser.Display.Color) => `rgb(${c.red},${c.green},${c.blue})`;
    const colors: Record<string, string> = {
      k: '#140f0a',
      c: css(base),
      l: css(base.clone().lighten(30)),
      d: css(base.clone().darken(25)),
    };
    const tex = scene.textures.createCanvas(key, 14, 14);
    if (!tex) continue;
    const ctx = tex.getContext();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = colors[row[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
