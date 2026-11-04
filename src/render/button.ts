import Phaser from 'phaser';
import { TEXT_RES, FONT, FONT_SCALE } from './theme';

/** Bevel thickness (px). */
const BEVEL = 2;
/** Extra tap area around the button (px), so it's easy to hit on a phone. */
const SLOP = 4;

/** A colour shifted lighter (+) or darker (-) by this share (0-1), as a number. */
function shade(hex: string, by: number): number {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const f = (v: number) => Math.round(by >= 0 ? v + (255 - v) * by : v * (1 + by));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

/**
 * The game's button: a square face with a black outline and a pixel bevel
 * (light top-left edge, dark bottom-right). Pressing swaps the bevel so the
 * button looks pushed in. Works like the old text buttons: setText,
 * setPadding, setOrigin, setBackgroundColor and setDepth all still apply.
 */
export class PixelButton extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private pad = { x: 24, y: 12 };
  private origin = { x: 0.5, y: 0.5 };
  private color: string;
  private pressed = false;
  private hover = false;
  private box = { left: 0, top: 0, w: 0, h: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: string, onTap: () => void) {
    super(scene, x, y);
    this.color = color;
    this.gfx = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: `${Math.round(size * FONT_SCALE)}px`, color: '#ffffff' }).setResolution(TEXT_RES).setOrigin(0.5).setFontStyle('bold');
    this.label.setShadow(1, 1, 'rgba(0,0,0,0.5)', 0);
    this.add([this.gfx, this.label]);
    scene.add.existing(this);
    this.layout();
    this.on('pointerdown', () => {
      this.setPressed(true);
      onTap();
    });
    this.on('pointerup', () => this.setPressed(false));
    this.on('pointerout', () => {
      this.hover = false;
      this.setPressed(false);
      this.draw();
    });
    this.on('pointerover', () => {
      this.hover = true;
      this.draw();
    });
  }

  /** Size everything around the label (after changing text, padding or origin). */
  private layout(): void {
    const w = Math.ceil(this.label.width + this.pad.x * 2);
    const h = Math.ceil(this.label.height + this.pad.y * 2);
    this.box = { left: -w * this.origin.x, top: -h * this.origin.y, w, h };
    this.setSize(w, h);
    // Phaser checks a container's tap area in coordinates shifted by half its
    // size (its display origin), so the area is offset to match the drawing.
    const area = new Phaser.Geom.Rectangle(this.box.left + this.displayOriginX - SLOP, this.box.top + this.displayOriginY - SLOP, w + SLOP * 2, h + SLOP * 2);
    if (this.input) this.input.hitArea = area;
    else this.setInteractive(area, Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';
    this.draw();
  }

  private draw(): void {
    const { left, top, w, h } = this.box;
    const g = this.gfx.clear();
    const shift = this.pressed ? 1 : 0;
    // Black outline, the face, then the bevel (swapped while pressed).
    g.fillStyle(0x000000).fillRect(left - 2, top - 2, w + 4, h + 4);
    g.fillStyle(shade(this.color, this.hover && !this.pressed ? 0.08 : this.pressed ? -0.08 : 0)).fillRect(left, top, w, h);
    const light = shade(this.color, 0.3);
    const dark = shade(this.color, -0.45);
    g.fillStyle(this.pressed ? dark : light)
      .fillRect(left, top, w, BEVEL)
      .fillRect(left, top, BEVEL, h);
    g.fillStyle(this.pressed ? light : dark)
      .fillRect(left, top + h - BEVEL, w, BEVEL)
      .fillRect(left + w - BEVEL, top, BEVEL, h);
    this.label.setPosition(left + w / 2 + shift, top + h / 2 + shift);
  }

  private setPressed(on: boolean): void {
    if (this.pressed === on) return;
    this.pressed = on;
    this.draw();
  }

  get text(): string {
    return this.label.text;
  }

  setText(text: string): this {
    if (text !== this.label.text) {
      this.label.setText(text);
      this.layout();
    }
    return this;
  }

  setPadding(x: number, y: number, _right?: number, _bottom?: number): this {
    this.pad = { x, y };
    this.layout();
    return this;
  }

  setOrigin(x: number, y = x): this {
    this.origin = { x, y };
    this.layout();
    return this;
  }

  setBackgroundColor(color: string): this {
    if (color === this.color) return this;
    this.color = color;
    this.draw();
    return this;
  }
}
