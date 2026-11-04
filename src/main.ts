import Phaser from 'phaser';
import '@fontsource/jersey-10/400.css';
import { BattleScene } from './render/BattleScene';
import { WORLD } from './sim/content';
import { ZOOM } from './render/theme';

/**
 * The game draws at the screen's own pixel density (up to 2x): the canvas is
 * ZOOM times the world size, and the camera zooms in to fill it, so shapes
 * and text stay sharp on phones. Game code works in world units (540 x 960).
 */
async function boot(): Promise<void> {
  // Text is drawn once into textures: wait for the pixel font first (but not forever).
  await Promise.race([
    document.fonts.load('16px "Jersey 10"'),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => undefined);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WORLD.width * ZOOM,
    height: WORLD.height * ZOOM,
    backgroundColor: '#0b0e14',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BattleScene],
  });
  // Handle for automated browser tests and debugging from the console.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

void boot();
