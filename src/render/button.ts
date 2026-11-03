import Phaser from 'phaser';
import { DPR, FONT } from './theme';

/** How far the button's thick bottom edge sticks out (px); the face sinks by this much when pressed. */
const EDGE = 5;

/** A colour this much darker (0-1), as a number. */
function darker(hex: string, by: number): number {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  return Phaser.Display.Color.GetColor(Math.round(c.red * (1 - by)), Math.round(c.green * (1 - by)), Math.round(c.blue * (1 - by)));
}

/**
 * The game's button: a square face with a black outline and a thick, darker
 * bottom edge that the face sinks into when you press it ("chunky press").
 * Works like the old text buttons: setText, setPadding, setOrigin,
 * setBackgroundColor and setDepth all still apply.
 */
export class ChunkyButton extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.Text;
  private readonly face: Phaser.GameObjects.Rectangle;
  private readonly edge: Phaser.GameObjects.Rectangle;
  private pad = { x: 24, y: 12 };
  private origin = { x: 0.5, y: 0.5 };
  private color: string;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: string, onTap: () => void) {
    super(scene, x, y);
    this.color = color;
    this.edge = scene.add.rectangle(0, 0, 10, 10, darker(color, 0.45)).setOrigin(0, 0).setStrokeStyle(2, 0x000000);
    this.face = scene.add.rectangle(0, 0, 10, 10, Phaser.Display.Color.HexStringToColor(color).color).setOrigin(0, 0).setStrokeStyle(2, 0x000000);
    this.label = scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff' }).setResolution(DPR).setOrigin(0.5).setFontStyle('bold');
    this.label.setShadow(0, 2, 'rgba(0,0,0,0.45)', 0);
    this.add([this.edge, this.face, this.label]);
    scene.add.existing(this);
    this.layout();
    this.on('pointerdown', () => {
      this.press(true);
      onTap();
    });
    this.on('pointerup', () => this.press(false));
    this.on('pointerout', () => this.press(false));
    this.on('pointerover', () => this.face.setFillStyle(Phaser.Display.Color.HexStringToColor(this.color).lighten(8).color));
  }

  /** Size everything around the label (call after changing text or padding). */
  private layout(): void {
    const w = Math.ceil(this.label.width + this.pad.x * 2);
    const h = Math.ceil(this.label.height + this.pad.y * 2);
    const left = -w * this.origin.x;
    const top = -(h + EDGE) * this.origin.y;
    const sink = this.pressed ? EDGE - 1 : 0;
    this.edge.setPosition(left, top + EDGE).setSize(w, h);
    this.face.setPosition(left, top + sink).setSize(w, h);
    this.label.setPosition(left + w / 2, top + sink + h / 2);
    this.setSize(w, h + EDGE);
    const area = new Phaser.Geom.Rectangle(left, top, w, h + EDGE);
    if (this.input) this.input.hitArea = area;
    else this.setInteractive(area, Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';
  }

  private press(on: boolean): void {
    if (this.pressed === on) return;
    this.pressed = on;
    if (!on) this.face.setFillStyle(Phaser.Display.Color.HexStringToColor(this.color).color);
    this.layout();
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
    this.face.setFillStyle(Phaser.Display.Color.HexStringToColor(color).color);
    this.edge.setFillStyle(darker(color, 0.45));
    return this;
  }
}
