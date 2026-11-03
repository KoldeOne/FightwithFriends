import { createRng } from './rng';

/** What's at a map node. */
/**
 * 'event' is a chance encounter (a "?" on the map; see events.ts); 'challenge'
 * an optional harder fight with a twist and a better reward; 'feast' a meal
 * that buffs the next two fights.
 */
export type NodeType = 'fight' | 'elite' | 'chest' | 'campsite' | 'shop' | 'event' | 'challenge' | 'feast' | 'boss';

export interface MapNode {
  id: string;
  floor: number;
  /** Column 0..MAP_COLS-1 (the screen spreads them across the width). */
  col: number;
  type: NodeType;
  /** Better loot here (a golden node): more gold, a better chest. */
  rich?: boolean;
  /** Nodes on the next floor this one leads to. */
  next: string[];
}

/** A map's personality: tilts the odds so routes and maps feel different. */
export type MapFlavor = 'balanced' | 'treasure' | 'dangerous' | 'merchant';

export interface ActMap {
  act: number;
  flavor: MapFlavor;
  /** floors[f] = node ids on floor f, left to right. The last floor is the boss. */
  floors: string[][];
  nodes: Record<string, MapNode>;
}

/** 12 floors of choices, then the boss. */
export const MAP_FLOORS = 12;
export const MAP_COLS = 7;
/** Paths drawn up the map (they merge and split, giving 3-5 nodes a floor). */
const PATHS = 6;

/**
 * Floors where every node is a campsite. In Act 1 the first three are the
 * recruit sites (so the party of 4 is full before the boss) and the fourth
 * trains, just before the boss; later acts get two each, for training. Floor numbers are 0-based (floor 2 = the third floor).
 */
export const CAMPSITE_FLOORS: Record<number, number[]> = { 1: [2, 5, 8, 11], 2: [5, 11], 3: [5, 11] };

/** Base odds for the other floors, by node type. */
const WEIGHTS: Record<MapFlavor, Partial<Record<NodeType, number>>> = {
  balanced: { fight: 44, elite: 12, chest: 11, shop: 10, campsite: 9, challenge: 7, feast: 6, event: 5 },
  treasure: { fight: 42, elite: 10, chest: 21, shop: 9, campsite: 6, challenge: 6, feast: 5, event: 5 },
  dangerous: { fight: 40, elite: 22, chest: 10, shop: 9, campsite: 6, challenge: 12, feast: 5, event: 4 },
  merchant: { fight: 44, elite: 10, chest: 10, shop: 18, campsite: 6, challenge: 6, feast: 5, event: 5 },
};

/**
 * A random map for an act, Slay the Spire style: several paths climb from the
 * bottom, merging and splitting but never crossing. Node types follow a few
 * rules so every route has a good mix: fights first, no elites or shops before
 * floor 4, no two special nodes in a row, fixed campsite floors, a shop and two
 * chests somewhere on every map, and the boss at the top.
 */
export function generateActMap(seed: number, act: number): ActMap {
  const rng = createRng(seed * 7919 + act * 104729);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const flavor: MapFlavor = act === 1 ? pick<MapFlavor>(['balanced', 'balanced', 'treasure', 'merchant']) : pick<MapFlavor>(['balanced', 'treasure', 'dangerous', 'merchant']);

  // 1. Paths: each starts in a column and moves up by -1/0/+1 a floor, without crossing an existing edge.
  const at = new Map<string, MapNode>();
  const key = (f: number, c: number) => `${f}:${c}`;
  const edges = new Set<string>(); // "f:c>c2"
  const crosses = (f: number, c: number, c2: number) => {
    // An edge f:c -> f+1:c2 crosses f:(c+d) -> f+1:(c2-d) style diagonals.
    if (c2 === c) return false;
    return edges.has(`${f}:${c2}>${c}`);
  };
  const starts: number[] = [];
  for (let p = 0; p < PATHS; p++) starts.push(p < 2 ? [1, 5][p] : 1 + Math.floor(rng() * (MAP_COLS - 2)));
  for (const start of starts) {
    let c = start;
    for (let f = 0; f < MAP_FLOORS; f++) {
      if (!at.has(key(f, c))) at.set(key(f, c), { id: key(f, c), floor: f, col: c, type: 'fight', next: [] });
      if (f === MAP_FLOORS - 1) break;
      const options = [c - 1, c, c + 1].filter((x) => x >= 0 && x < MAP_COLS && !crosses(f, c, x));
      const c2 = options.length ? pick(options) : c;
      edges.add(`${f}:${c}>${c2}`);
      const node = at.get(key(f, c))!;
      if (!node.next.includes(key(f + 1, c2))) node.next.push(key(f + 1, c2));
      c = c2;
    }
  }
  // Boss on top; every node on the last floor leads to it.
  const bossId = key(MAP_FLOORS, Math.floor(MAP_COLS / 2));
  const boss: MapNode = { id: bossId, floor: MAP_FLOORS, col: Math.floor(MAP_COLS / 2), type: 'boss', next: [] };
  for (const n of at.values()) if (n.floor === MAP_FLOORS - 1) n.next = [bossId];
  at.set(bossId, boss);

  const floors: string[][] = [];
  for (let f = 0; f <= MAP_FLOORS; f++) {
    floors.push([...at.values()].filter((n) => n.floor === f).sort((a, b) => a.col - b.col).map((n) => n.id));
  }
  const nodes = Object.fromEntries([...at.values()].map((n) => [n.id, n]));
  const parents = (id: string) => Object.values(nodes).filter((n) => n.next.includes(id));

  // 2. Node types.
  const fixed = CAMPSITE_FLOORS[act] ?? [];
  const weights = WEIGHTS[flavor];
  for (let f = 0; f < MAP_FLOORS; f++) {
    for (const id of floors[f]) {
      const n = nodes[id];
      if (f === 0 || f === 1) n.type = 'fight';
      else if (fixed.includes(f)) n.type = 'campsite';
      else {
        // Act 1's only campsites are the recruit floors; no campsite right before a campsite floor.
        const allowed = (Object.entries(weights) as [NodeType, number][]).filter(([t]) => {
          if ((t === 'elite' || t === 'shop' || t === 'challenge') && f < 3) return false;
          if (t === 'campsite' && (act === 1 || fixed.includes(f + 1) || fixed.includes(f - 1))) return false;
          // No two of the same special node in a row along a path.
          if (t !== 'fight' && parents(id).some((p) => p.type === t)) return false;
          return true;
        });
        const total = allowed.reduce((a, [, w]) => a + w, 0);
        let r = rng() * total;
        n.type = allowed[allowed.length - 1][0];
        for (const [t, w] of allowed) {
          if ((r -= w) < 0) {
            n.type = t;
            break;
          }
        }
      }
      // Some nodes are golden: better loot. More on a treasure map.
      if (['fight', 'elite', 'chest'].includes(n.type) && rng() < (flavor === 'treasure' ? 0.22 : 0.12)) n.rich = true;
    }
  }
  // 3. Guarantees: at least one shop and two chests on every map, and one chance encounter.
  const middle = Object.values(nodes).filter((n) => n.type === 'fight' && n.floor >= 3 && n.floor < MAP_FLOORS - 1 && !fixed.includes(n.floor));
  const ensure = (type: NodeType, count: number) => {
    let have = Object.values(nodes).filter((n) => n.type === type).length;
    while (have < count && middle.length) {
      const n = middle.splice(Math.floor(rng() * middle.length), 1)[0];
      if (parents(n.id).some((p) => p.type === type)) continue;
      n.type = type;
      have++;
    }
  };
  ensure('shop', 1);
  ensure('chest', 2);
  ensure('event', 1);
  return { act, flavor, floors, nodes };
}

/** Nodes you can move to next: the start floor at first, then the current node's links. */
export function nextNodes(map: ActMap, at: string | null): MapNode[] {
  if (!at) return map.floors[0].map((id) => map.nodes[id]);
  return map.nodes[at].next.map((id) => map.nodes[id]);
}
