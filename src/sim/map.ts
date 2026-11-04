import { createRng } from './rng';

/**
 * What's at a map node. 'event' is a chance encounter (a "?" on the map; see
 * events.ts). Some elites carry a twist (see eliteTwist in run.ts).
 */
export type NodeType = 'fight' | 'elite' | 'chest' | 'campsite' | 'shop' | 'event' | 'boss';

export interface MapNode {
  id: string;
  floor: number;
  /** Column 0..MAP_COLS-1 around the map (it wraps: the last column sits next to the first). */
  col: number;
  type: NodeType;
  /** Better loot here (a golden node): more gold, a better chest. */
  rich?: boolean;
  /** Nodes on the next floor this one leads to. */
  next: string[];
}

export interface ActMap {
  act: number;
  /** floors[f] = node ids on floor f, left to right. The last floor is the boss. */
  floors: string[][];
  nodes: Record<string, MapNode>;
  /** Where you can go from the act's starting camp (older maps: the whole first floor). */
  start?: string[];
  /** The columns wrap around (a ring of MAP_COLS), so the screen lays out a few floors around you. */
  ring?: boolean;
}

/** 12 floors of choices, then the boss. */
export const MAP_FLOORS = 12;
/** Columns around the ring; each floor uses every other one (4 nodes a floor). */
export const MAP_COLS = 8;
/** The starting camp's column (it leads to the two first-floor nodes beside it). */
const START_COL = 3;

/**
 * Floors where every node is a campsite (0-based: floor 2 = the third floor).
 * Floor 5 in Acts 1 and 2 is a recruit site (RECRUIT_FLOORS in run.ts); the
 * others train.
 */
export const CAMPSITE_FLOORS: Record<number, number[]> = { 1: [2, 5, 8, 11], 2: [5, 11], 3: [5, 11] };

/** Odds for the other floors, by node type. */
const WEIGHTS: Partial<Record<NodeType, number>> = { fight: 50, elite: 16, chest: 11, shop: 10, campsite: 7, event: 6 };

/**
 * A random map for an act: a diamond lattice wrapped around a ring of
 * columns. Every node forks: it leads up-left and up-right to two nodes on the
 * next floor, and those are of different kinds, so each step is a real choice
 * (except into a fixed campsite floor, and into the boss). Neighbouring forks
 * share a node, so routes split and rejoin. The screen only ever shows a few
 * floors around you, centred, so the wrap is never seen. Node types follow a few rules so every
 * route has a good mix: fights first, no elites or shops before floor 4, no
 * two special nodes in a row, fixed campsite floors, a shop and two chests
 * somewhere on every map, and the boss at the top.
 */
export function generateActMap(seed: number, act: number): ActMap {
  const rng = createRng(seed * 7919 + act * 104729);

  // 1. The lattice: floor f uses the columns with f's parity; each node leads to the columns either side of it.
  const at = new Map<string, MapNode>();
  const key = (f: number, c: number) => `${f}:${c}`;
  const wrap = (c: number) => (c + MAP_COLS) % MAP_COLS;
  for (let f = 0; f < MAP_FLOORS; f++) {
    for (let c = f % 2; c < MAP_COLS; c += 2) {
      at.set(key(f, c), { id: key(f, c), floor: f, col: c, type: 'fight', next: f < MAP_FLOORS - 1 ? [key(f + 1, wrap(c - 1)), key(f + 1, wrap(c + 1))] : [] });
    }
  }
  // The starting camp leads to the two first-floor nodes beside it; drop what it can't reach.
  const start = [key(0, wrap(START_COL - 1)), key(0, wrap(START_COL + 1))];
  const reach = new Set<string>(start);
  for (let f = 0; f < MAP_FLOORS; f++) for (const n of at.values()) if (n.floor === f && reach.has(n.id)) n.next.forEach((id) => reach.add(id));
  for (const id of [...at.keys()]) if (!reach.has(id)) at.delete(id);
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
  const weights = WEIGHTS;
  for (let f = 0; f < MAP_FLOORS; f++) {
    for (const id of floors[f]) {
      const n = nodes[id];
      if (f === 0) n.type = 'fight';
      else if (fixed.includes(f)) n.type = 'campsite';
      else {
        // Act 1 has campsites only on its fixed floors; no campsite right next to a campsite floor.
        const allowed = (Object.entries(weights) as [NodeType, number][]).filter(([t]) => {
          // Floor 2 is fights, a chest or a chance encounter: nothing harder yet.
          if (f === 1 && t !== 'fight' && t !== 'chest' && t !== 'event') return false;
          if ((t === 'elite' || t === 'shop') && f < 3) return false;
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
      if (['fight', 'elite', 'chest'].includes(n.type) && rng() < 0.12) n.rich = true;
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
  // 4. Real choices: the nodes a fork leads to aren't all the same kind. If they are, one of them changes
  // (a fight becomes something special; a repeated special becomes a fight).
  const kids = (n: MapNode) => n.next.map((id) => nodes[id]);
  /** The other nodes sharing a fork with this one. */
  const siblings = (n: MapNode) => parents(n.id).flatMap((p) => kids(p)).filter((x) => x !== n);
  /** A type this node can become: not the same as its neighbours along a path, nor as anything it shares a fork with. */
  const retype = (n: MapNode, from: NodeType): NodeType | undefined => {
    const f = n.floor;
    const near = [...parents(n.id), ...kids(n)].map((x) => x.type);
    const sib = siblings(n).map((x) => x.type);
    if (from !== 'fight' && !sib.includes('fight')) return 'fight';
    const options = (Object.entries(weights) as [NodeType, number][]).filter(([t]) => {
      if (t === 'fight' || t === from || near.includes(t) || sib.includes(t)) return false;
      if (f === 1 && t !== 'chest' && t !== 'event') return false;
      if ((t === 'elite' || t === 'shop') && f < 3) return false;
      if (t === 'campsite' && (act === 1 || fixed.includes(f + 1) || fixed.includes(f - 1))) return false;
      return true;
    });
    if (!options.length) return undefined;
    let r = rng() * options.reduce((a, [, w]) => a + w, 0);
    for (const [t, w] of options) if ((r -= w) < 0) return t;
    return options[options.length - 1][0];
  };
  /** One pass over the map; returns whether anything changed (a change can unsettle a neighbouring fork). */
  const diversifyOnce = (): boolean => {
    let changed = false;
    for (let f = 0; f < MAP_FLOORS - 1; f++) {
      if (fixed.includes(f + 1)) continue;
      for (const id of floors[f]) {
        const ks = kids(nodes[id]);
        if (ks.length < 2 || ks.some((k) => k.type !== ks[0].type)) continue;
        for (const k of [...ks].sort((a, b) => parents(a.id).length - parents(b.id).length)) {
          const t = retype(k, k.type);
          if (!t) continue;
          k.type = t;
          if (!['fight', 'elite', 'chest'].includes(t)) delete k.rich;
          changed = true;
          break;
        }
      }
    }
    return changed;
  };
  const diversify = () => {
    for (let i = 0; i < 8 && diversifyOnce(); i++);
  };
  for (let i = 0; i < 3; i++) {
    diversify();
    ensure('shop', 1);
    ensure('chest', 2);
    ensure('event', 1);
  }
  diversify();
  return { act, floors, nodes, start, ring: true };
}

/** Nodes you can move to next: the start floor at first, then the current node's links. */
export function nextNodes(map: ActMap, at: string | null): MapNode[] {
  if (!at) return (map.start ?? map.floors[0]).map((id) => map.nodes[id]);
  return map.nodes[at].next.map((id) => map.nodes[id]);
}
