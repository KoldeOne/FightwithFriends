import Phaser from 'phaser';
import { BattleScene } from './render/BattleScene';
import { WORLD } from './sim/content';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: '#0b0e14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BattleScene],
});

// Handle for automated browser tests and debugging from the console.
(window as unknown as { __game: Phaser.Game }).__game = game;
