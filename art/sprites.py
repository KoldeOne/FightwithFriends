"""
Temporary pixel-art sprites for enemies and the newer heroes, in the same
text-grid style as art/heroes/make-sprites.ps1 (each letter is one pixel,
'.' is transparent, the palette below matches the hero sprites).

Run:  python3 art/sprites.py
Writes src/render/pixelArt.ts (the grids the game draws at runtime) and
art/sprites-preview.png (every sprite at 6x, to look at).

Sprites are built from shared parts (heads, bodies, weapons) so each faction
looks consistent. Bigger enemies use the same grid size but are drawn larger
in the game (see SPRITE_SCALE_BY_KIND in pixelArt.ts).
"""
from __future__ import annotations

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PALETTE = {
    # Shared with art/heroes/make-sprites.ps1
    'k': '#1b1726',  # outline
    's': '#f2c4a0', 'S': '#c98f6e',  # skin
    'h': '#6b3f22',  # brown hair
    'm': '#b8c2cc', 'M': '#7d8894', 'l': '#eef3f7',  # steel
    'r': '#b3262e', 'R': '#7a1820',  # red cloth
    'g': '#e3b341',  # gold
    'b': '#6b4428', 'B': '#3e2918',  # leather
    'w': '#f2f0e8', 'W': '#b8b4a6',  # white cloth
    'L': '#fff1a0',  # holy light
    'c': '#79e2ff', 'C': '#2f9fd6',  # arcane cyan
    'd': '#4a4f60', 'D': '#2a2d38',  # dark cloth
    'e': '#7d5b3d', 'E': '#5a412b',  # tunic leather
    # Added for enemies and new heroes
    'n': '#74b04a', 'N': '#4d7f2e',  # goblin skin
    'y': '#ffe14d',  # yellow eyes
    'x': '#ff3b2f',  # glowing red eyes
    'i': '#e8e0c8', 'I': '#a9a28a',  # bone
    'a': '#6b4f9a', 'A': '#3f2d63',  # purple robe
    'q': '#8fa07a', 'Q': '#5f6e4f',  # ghoul flesh
    'z': '#d2452f', 'Z': '#8a2318',  # demon red
    'f': '#ff9a2e', 'F': '#ffe066',  # fire
    't': '#3a3340', 'T': '#5b4f66',  # near-black (demon lord)
    'G': '#8dff6b', 'J': '#3fa83a',  # fel green
    'P': '#d99aa6', 'U': '#a86a78',  # stitched flesh
    'H': '#9b7a4e',  # wood
    'v': '#4a62d8', 'V': '#2c3a8c',  # blue
}

SIZE = 32


class Sprite:
    def __init__(self, w: int = SIZE, h: int = SIZE):
        self.w, self.h = w, h
        self.px = [['.'] * w for _ in range(h)]

    def stamp(self, x: int, y: int, rows: list[str], recolor: dict[str, str] | None = None) -> 'Sprite':
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch == '.':
                    continue
                if recolor:
                    ch = recolor.get(ch, ch)
                X, Y = x + dx, y + dy
                if 0 <= X < self.w and 0 <= Y < self.h:
                    self.px[Y][X] = ch
        return self

    def rows(self) -> list[str]:
        return [''.join(r) for r in self.px]


# --- parts -------------------------------------------------------------------

GOBLIN_HEAD = [
    'kk..............kk',
    'knk..kkkkkkkk..knk',
    'knnkknnnnnnnnkknnk',
    '.knnnnnnnnnnnnnnk.',
    '..knnykknnkkynnk..',
    '..knnnnnnnnnnnnk..',
    '..knnnNnnnnNnnnk..',
    '...knnkwkkwknnk...',
    '....kNNNNNNNNk....',
    '.....kkkkkkkk.....',
]

GOBLIN_BODY = [
    '.kkkbbbbbbkkk.',
    'knnkbeeeebknnk',
    'knnkbeEEebknnk',
    'knnkbeeeebknnk',
    'kNNkbbgbbbkNNk',
    '.kk.kbbbbk.kk.',
    '....kEEEEk....',
    '....kNkkNk....',
    '....kNk.kNk...',
    '...kBBk.kBBk..',
]

GOBLIN_ROBE = [
    '.kkkaaaaaakkk.',
    'knnkaAaaAaknnk',
    'knnkaaggaaknnk',
    'knnkaaaaaaknnk',
    'kNNkaAaaAakNNk',
    '.kk.kaaaaak.kk',
    '...kaaaaaaak..',
    '...kAaaaaaAk..',
    '...kkAAAAAkk..',
    '....kBk.kBk...',
]

HOOD = [  # archer hood over the goblin head (green-brown)
    '.....kkkkkkkk.....',
    '....kEEEEEEEEk....',
    '...kEeeeeeeeeEk...',
]

FEATHERS = [
    '..k.k.k..',
    '.kfkrkyk.',
    '.kfkrkyk.',
    '..kkkkk..',
]

HORNED_HELM = [
    'k....................k',
    'kik................kik',
    '.kik..kkkkkkkkkk..kik.',
    '..kikkmmmmmmmmmmkkik..',
    '...kkmllmmmmmmmmMkk...',
    '.....kkkkkkkkkkkk.....',
]

SKULL = [
    '....kkkkkkkk....',
    '...kiiiiiiiik...',
    '..kiiiiiiiiiik..',
    '..kiiiiiiiiiik..',
    '..kikkkiikkkik..',
    '..kikxkiikxkik..',
    '..kiiiiikiiiik..',
    '...kiiikkiiik...',
    '....kikikiik....',
    '....kIkIkIkk....',
    '.....kkkkkk.....',
]

RIBCAGE = [
    '...kkkkkkkk...',
    '..kiikIIkiik..',
    '.kikkiiiikkik.',
    '.kik.kIIk.kik.',
    '.kik.kiik.kik.',
    '.kk..kIIk..kk.',
    '.....kiik.....',
    '....kIiiIk....',
    '....kikkik....',
    '....kik.kik...',
    '....kik.kik...',
    '...kIIk.kIIk..',
]

CROWN = [
    'k..k..k..k..k',
    'kgkkgkkgkkgkk',
    'kgggggggggggk',
    'kgygggxgggygk',
    'kkkkkkkkkkkkk',
]

CULTIST = [
    '......kkkkkk......',
    '.....kAaaaaAk.....',
    '....kAaaaaaaAk....',
    '...kAakkkkkkaAk...',
    '...kAkWWWWWWkAk...',
    '...kAkWxkkxWkAk...',
    '...kAkWWWWWWkAk...',
    '...kAakWWWWkaAk...',
    '..kAaaakkkkaaaAk..',
    '..kaaaaaaaaaaaak..',
    '.kWkaaaaggaaaakWk.',
    '.kWkaAaaaaaaAakWk.',
    '..kkaaaaaaaaaakk..',
    '...kaAaaaaaaAak...',
    '...kaaaaaaaaaak...',
    '..kAaaaaaaaaaaAk..',
    '..kAAAAAAAAAAAAk..',
    '...kkkkkkkkkkkk...',
]

GHOUL = [
    '......kkkkkk...........',
    '.....kqqqqqqk..........',
    '....kqqqqqqqqk.........',
    '....kqxkqqxkqk.........',
    '....kqqqqqqqqk.........',
    '.....kqkwkwkqk.........',
    '....kkqkkkkkqkkkkk.....',
    '..kkqqqqqqqqqqqqqqk....',
    '.kqqqQqqqqqqqqqqqqqk...',
    'kqk.kqqqqQqqqqqqqqQk...',
    'kik.kqqqqqqqqqqqqqk....',
    'kik..kQqqqqqqqqqqk.....',
    '.k....kqqQQQqqqqk......',
    '......kdddddddddk......',
    '......kdDdddddDdk......',
    '......kqqk...kqqk......',
    '.....kqqk.....kqqk.....',
    '.....kiik.....kiik.....',
    '.....kkk.......kkk.....',
]

ABOMINATION = [
    '..........kkkkkk..........',
    '.........kPPPPPPk.........',
    '........kPxkPPkxPk........',
    '........kPPPPPPPPk........',
    '.........kPkwwkPk.........',
    '.....kkkkkPPPPPPkkkkk.....',
    '....kPPPPPPPPPPPPPPPPk....',
    '...kPPUPPkPPPPPPkPPUPPk...',
    '..kPPPUPPPkPPPPkPPPUPPPk..',
    '..kPPPPPkkPPPPPPkkPPPPPk..',
    '..kPPPPPPkPPUPPPkPPPPPPk..',
    '..kUPPkPPPPPUUPPPPPkPPUk..',
    '..kPPk.kPPkkkkkkPPk.kPPk..',
    '..kPPk.kPkPPPPPPkPk.kPPk..',
    '..kUUk.kPPPPPPPPPPk.kUUk..',
    '...kk..kUPPPPPPPPUk..kk...',
    '.......kddddddddddk.......',
    '.......kdDddddddDdk.......',
    '.......kPPPk..kPPPk.......',
    '.......kPPPk..kPPPk.......',
    '......kBBBBk..kBBBBk......',
    '......kkkkkk..kkkkkk......',
]

DEMON_HEAD = [
    'kk..........kk',
    'kik........kik',
    '.kik.kkkk.kik.',
    '..kikzzzzkik..',
    '...kzzzzzzk...',
    '..kzxkzzkxzk..',
    '..kzzzzzzzzk..',
    '..kZzkwwkzZk..',
    '...kZZZZZZk...',
    '....kkkkkk....',
]

DEMON_BODY = [
    '..kkkzzzzzzkkk..',
    '.kzzkzzZZzzkzzk.',
    'kzzzkzZzzZzkzzzk',
    'kzzkkzzzzzzkkzzk',
    'kZZk.kzzzzk.kZZk',
    'kzzk.kZZZZk.kzzk',
    '.kk..kttttk..kk.',
    '.....kzkkzk.....',
    '.....kzk.kzk....',
    '....kZZk.kZZk...',
    '....kkk...kkk...',
]

IMP = [
    'kk...kkkk...kk',
    'kzk.kzzzzk.kzk',
    'kzzkzzzzzzkzzk',
    '.kzzzzzzzzzzk.',
    '..kzyzzzzyzk..',
    '..kzzzkkzzzk..',
    '...kzzzzzzk...',
    'kk..kzzzzk..kk',
    'kzkkzzzzzzkkzk',
    '.kzkzzZZzzkzk.',
    '..kkzzzzzzkk..',
    '....kzkkzk....',
    '....kZk.kZk...',
    '....kk...kk...',
]

HELLHOUND = [
    '.k.k..................',
    'kzkzk.................',
    'kzzzzk..........f.f...',
    'kxzzzzk........fFkFf..',
    'kzzzzzzkkkkkkkkfkFkf..',
    'kwkzzzzzzzzzzzzzzzk...',
    '.kkkzzzZzzzzzZzzzzzk..',
    '...kzzzzZZZZZzzzzzzk..',
    '...kzzzkkkkkkkkzzzzk..',
    '...kZzk......kZZkzZk..',
    '...kZk.......kZk.kZk..',
    '..kkkk......kkkk.kkk..',
]

SHADOW_CALLER = [
    '..kk..........kk..',
    '..kik........kik..',
    '...kikkkkkkkkik...',
    '...kAAAAAAAAAAk...',
    '..kAAkkkkkkkkAAk..',
    '..kAktttttttkAAk..',
    '..kAktGkttGktAAk..',
    '..kAAkttttttkAAk..',
    '.kAAAAkkkkkkAAAAk.',
    '.kAaaaaaaaaaaaaAk.',
    'kTkaaaAaaAaaaakTk.',
    'kTkaaaaGGaaaaakTk.',
    '.kkaaaaaaaaaaakk..',
    '..kaAaaaaaaaaAk...',
    '..kaaaaaaaaaaak...',
    '.kAaaaaaaaaaaaAk..',
    '.kAAAAAAAAAAAAAk..',
    '..kkkkkkkkkkkkk...',
]

DEMON_WINGS = [
    'kk......................kk',
    'kZk....................kZk',
    'kZZk..................kZZk',
    'kZtZk................kZtZk',
    'kZttZk..............kZttZk',
    'kZtttZk............kZtttZk',
    '.kZttZk............kZttZk.',
    '..kZtZk............kZtZk..',
    '...kZk..............kZk...',
    '....k................k....',
]

# Weapons and held things
AXE = ['kkkk.', 'kmmmk', 'kmlMk', 'kkkbk', '..kbk', '..kbk', '..kbk', '..kk.']
BOW = ['.kk.', 'kHkW', 'kHkW', 'kHkW', 'kHkW', 'kHkW', 'kHkW', '.kk.']
STAFF_SKULL = ['.kkk.', 'kiiik', 'kxixk', '.kik.', '..H..', '..H..', '..H..', '..H..', '..H..', '..H..', '..H..', '..H..']
CLUB = ['.kkk.', 'kbbbk', 'kbBbk', 'kbbbk', '.kbk.', '.kbk.', '.kbk.', '..k..']
BIG_AXE = ['kkkkk..', 'kmmmmk.', 'kmllmMk', 'kmmmmMk', 'kkkkbk.', '...kbk.', '...kbk.', '...kbk.', '...kbk.', '...kbk.', '....k..']
SWORD = ['.k.', 'klk', 'klk', 'klk', 'klk', 'klk', 'kgk', 'kbk', '.k.']
CLEAVER = ['kkkkk', 'kmmmk', 'kmllk', 'kmmmk', 'kkkbk', '..kbk', '..kbk', '...k.']
ORB = ['.kkk.', 'kGGGk', 'kGJGk', 'kGGGk', '.kkk.']
FIRE_SWORD = ['.F.', 'kfk', 'kfk', 'kFk', 'kfk', 'kFk', 'kfk', 'kfk', 'ktk', 'kgk', 'kbk', '.k.']
FIREBALL = ['.f.', 'fFf', '.f.']


def goblin(body=GOBLIN_BODY, head_recolor=None, body_recolor=None) -> Sprite:
    s = Sprite()
    s.stamp(7, 22, body, body_recolor)
    s.stamp(5, 12, GOBLIN_HEAD, head_recolor)
    return s


def grunt() -> Sprite:
    return goblin().stamp(21, 20, AXE)


def archer() -> Sprite:
    s = goblin(body_recolor={'e': 'N', 'E': 'E'})
    s.stamp(5, 11, HOOD)
    s.stamp(3, 21, BOW)
    return s


def shaman() -> Sprite:
    s = goblin(body=GOBLIN_ROBE)
    s.stamp(10, 8, FEATHERS)
    s.stamp(22, 14, STAFF_SKULL)
    return s


def brute() -> Sprite:
    s = goblin(body_recolor={'e': 'n', 'E': 'N', 'b': 'B'}, head_recolor={'y': 'x'})
    s.stamp(21, 18, CLUB)
    return s


def warchief() -> Sprite:
    s = goblin(body_recolor={'e': 'r', 'E': 'R'})
    s.stamp(3, 9, HORNED_HELM)
    s.stamp(21, 15, BIG_AXE)
    return s


def skeleton(weapon=SWORD, wx=22, wy=17) -> Sprite:
    s = Sprite()
    s.stamp(9, 20, RIBCAGE)
    s.stamp(8, 9, SKULL)
    s.stamp(wx, wy, weapon)
    return s


def bone_archer() -> Sprite:
    return skeleton(BOW, 4, 18)


def bone_king() -> Sprite:
    s = skeleton(BIG_AXE, 21, 13)
    s.stamp(9, 5, CROWN)
    # a red cape behind the ribs
    s.stamp(8, 20, ['k..........k', 'r..........r', 'r..........r', 'R..........R', 'R..........R'])
    return s


def from_rows(rows: list[str], x: int, y: int) -> Sprite:
    return Sprite().stamp(x, y, rows)


def fiend() -> Sprite:
    s = Sprite()
    s.stamp(8, 20, DEMON_BODY)
    s.stamp(9, 11, DEMON_HEAD)
    s.stamp(23, 19, CLEAVER)
    return s


def pit_brute() -> Sprite:
    s = Sprite()
    s.stamp(8, 20, DEMON_BODY, {'z': 'Z', 'Z': 't'})
    s.stamp(9, 11, DEMON_HEAD, {'z': 'Z', 'Z': 't'})
    s.stamp(23, 17, CLUB, {'b': 't', 'B': 'Z'})
    return s


def demon_lord() -> Sprite:
    s = Sprite()
    s.stamp(3, 8, DEMON_WINGS)
    s.stamp(8, 20, DEMON_BODY, {'z': 't', 'Z': 'T'})
    s.stamp(9, 11, DEMON_HEAD, {'z': 't', 'Z': 'T', 'x': 'f'})
    s.stamp(24, 14, FIRE_SWORD)
    return s


def imp() -> Sprite:
    s = from_rows(IMP, 9, 18)
    s.stamp(22, 22, FIREBALL)
    return s


# --- heroes (new classes) ------------------------------------------------------

PALADIN = [
    '..........kkkkkkkkkkkk..........',
    '.........kmmmmmmmmmmmmk.........',
    '........kmllmmmmmmmmmmMk........',
    '........kmmmmmmggmmmmmMk........',
    '........kmkkkkkkkkkkkkMk........',
    '........kmkssssssssssk.k........',
    '........kmksksssssksskMk........',
    '........kmMssssSSssssMMk........',
    '.........kMMMMMMMMMMMMk.........',
    '......kkkkkkkkkkkkkkkkkkkk......',
    '.....kllmmkwwwwwwwwwwkmmllk.....',
    '.....kmmmmkwwwwggwwwwkmmmmk.....',
    '.....kMMMMkwwggggggwwkMMMMk.....',
    '......kkkkwwwwwggwwwwwkkkk......',
    '......kMMkwwwwwggwwwwwkMMk......',
    '......kMMkWwwwwggwwwwWkMMk......',
    '......ksskgggggggggggggssk......',
    '......kkkkWwwwwwwwwwwwWkkkk.....',
    '.........kWwwwwkkwwwwWk.........',
    '.........kMMMMk..kMMMMk.........',
    '.........kMMMMk..kMMMMk.........',
    '........kmmmmmk..kmmmmmk........',
    '........kkkkkkk..kkkkkkk........',
]
HAMMER = ['kkkkkk', 'kmmmmk', 'kmllmk', 'kkbbkk', '..bb..', '..bb..', '..bb..', '..bb..', '..gg..', '..kk..']
ROUND_SHIELD = ['..kkkk..', '.kggggk.', 'kgwwwwgk', 'kgwLLwgk', 'kgwLLwgk', 'kgwwwwgk', '.kggggk.', '..kkkk..']

WARLOCK = [
    '...........kkkkkkkkkk...........',
    '..........kAaaaaaaaaAk..........',
    '.........kAaaaaaaaaaaAk.........',
    '........kAaakkkkkkkkaaAk........',
    '........kAakSsssssSSkaAk........',
    '........kAakGksssskGkaAk........',
    '........kAakssssssssskaAk.......',
    '........kAaakSSSSSSkaaAk........',
    '.......kAaaaakkkkkkaaaaAk.......',
    '......kAaaaaaaaaaaaaaaaaAk......',
    '.....kAaaaaaaAJGGJAaaaaaaAk.....',
    '.....kaaakaaaaaJJaaaaakaaak.....',
    '.....kssakaaaaaaaaaaaakassk.....',
    '......kkkkaaAaaaaaaAaakkkk......',
    '.........kaaaaaaaaaaaak.........',
    '.........kaAaaaaaaaaAak.........',
    '........kAaaaaaaaaaaaaAk........',
    '........kAAAAAAAAAAAAAAk........',
    '.........kBBBBk..kBBBBk.........',
    '.........kkkkkk..kkkkkk.........',
]
WARLOCK_STAFF = ['.kkkk.', 'kiiiik', 'kGiiGk', 'kiiiik', '.kiik.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '..kHk.', '...k..']


def paladin() -> Sprite:
    s = Sprite()
    s.stamp(0, 9, PALADIN)
    s.stamp(1, 18, ROUND_SHIELD)
    s.stamp(25, 14, HAMMER)
    return s


def warlock() -> Sprite:
    s = Sprite()
    s.stamp(0, 12, WARLOCK)
    s.stamp(25, 9, WARLOCK_STAFF)
    s.stamp(1, 20, ORB)
    return s


SPRITES = {
    # heroes
    'hero-paladin': paladin,
    'hero-warlock': warlock,
    # goblins
    'enemy-grunt': grunt,
    'enemy-archer': archer,
    'enemy-shaman': shaman,
    'enemy-brute': brute,
    'enemy-warchief': warchief,
    # undead
    'enemy-skeleton': skeleton,
    'enemy-boneArcher': bone_archer,
    'enemy-cultist': lambda: from_rows(CULTIST, 7, 14).stamp(23, 9, STAFF_SKULL),
    'enemy-ghoul': lambda: from_rows(GHOUL, 4, 13),
    'enemy-abomination': lambda: from_rows(ABOMINATION, 3, 10).stamp(25, 16, CLEAVER),
    'enemy-boneKing': bone_king,
    # demons
    'enemy-imp': imp,
    'enemy-hellhound': lambda: from_rows(HELLHOUND, 5, 20),
    'enemy-fiend': fiend,
    'enemy-shadowCaller': lambda: from_rows(SHADOW_CALLER, 7, 14).stamp(1, 20, ORB),
    'enemy-pitBrute': pit_brute,
    'enemy-demonLord': demon_lord,
}


# --- icons (abilities, passives, effects) ----------------------------------------
#
# 14x14: a dark border, a background colour (by class, or buff / debuff), and a
# 12x12 glyph. In a glyph: '#' = the icon's colour, 'h' = highlight, 'o' = outline.

PALETTE.update({
    '1': '#5a2020',  # warrior
    '2': '#5a4814',  # paladin
    '3': '#2c4560',  # priest
    '4': '#1f3266',  # mage
    '5': '#3d2257',  # warlock
    '6': '#22402c',  # rogue
    '7': '#2e3445',  # neutral / passive pick
    '8': '#5a1d2c',  # debuff
    '9': '#1d5143',  # buff
})

G = {
    'sword': ['..........hh', '.........h#h', '........h#h.', '.......h#h..', '......h#h...', '..#..h#h....',
              '..##h#h.....', '...###......', '..#.##......', '.#...#......', '##..........', '#...........'],
    'shield': ['.##########.', '.#hhhh#####.', '.#hh#######.', '.#h########.', '.##########.', '.##########.',
               '..########..', '..########..', '...######...', '....####....', '.....##.....', '............'],
    'star': ['............', '.....##.....', '.#...##...#.', '..#..##..#..', '...######...', '.####hh####.',
             '.####hh####.', '...######...', '..#..##..#..', '.#...##...#.', '.....##.....', '............'],
    'swirl': ['............', '...######...', '..#......#..', '.#..####..#.', '.#.#....#.#.', '.#.#.##.#.#.',
              '.#.#..#.#.#.', '.#..##..#.#.', '..#.....#.#.', '...#####..#.', '.........#..', '..######....'],
    'bolt': ['.......###..', '......###...', '.....###....', '....###.....', '...#######..', '..#######...',
             '.....###....', '....###.....', '...###......', '..##........', '.#..........', '............'],
    'heart': ['............', '..###..###..', '.#####.####.', '.##hh######.', '.#h########.', '.##########.',
              '..########..', '...######...', '....####....', '.....##.....', '............', '............'],
    'banner': ['.#..........', '.#######....', '.#hhhh###...', '.#######....', '.########...', '.#######....',
               '.#..........', '.#..........', '.#..........', '.#..........', '###.........', '............'],
    'cross': ['....####....', '....#hh#....', '....#hh#....', '#####hh#####', '#hhhhhhhhhh#', '#hhhhhhhhhh#',
              '#####hh#####', '....#hh#....', '....#hh#....', '....#hh#....', '....####....', '............'],
    'leaf': ['..........##', '........####', '......###h##', '.....###h###', '....###h###.', '...###h###..',
             '..###h###...', '..##h###....', '.#h####.....', '.#.##.......', '#...........', '............'],
    'wings': ['............', '#....##....#', '##...##...##', '###..##..###', '####.##.####', '#####hh#####',
              '.####hh####.', '..###hh###..', '...##hh##...', '.....##.....', '............', '............'],
    'ring': ['....####....', '..##....##..', '.#..####..#.', '.#.#....#.#.', '#.#..hh..#.#', '#.#.hhhh.#.#',
             '#.#.hhhh.#.#', '#.#..hh..#.#', '.#.#....#.#.', '.#..####..#.', '..##....##..', '....####....'],
    'chain': ['............', '..###.......', '.#...#......', '.#...#......', '..#####.....', '....#...#...',
              '.....#####..', '......#...#.', '......#...#.', '.......###..', '............', '............'],
    'flame': ['.....#......', '.....##.....', '....###.....', '....####..#.', '...#####.##.', '..###h####..',
              '..##hhh###..', '.###hhh####.', '.##hhhhh###.', '.##hhhhh###.', '..##hhh###..', '...######...'],
    'snow': ['.....##.....', '..#..##..#..', '...#.##.#...', '....####....', '##..#hh#..##', '############',
             '############', '##..#hh#..##', '....####....', '...#.##.#...', '..#..##..#..', '.....##.....'],
    'shard': ['..........##', '.........#h#', '........#h#.', '.......#h#..', '......#h#...', '.....#h#....',
              '....#h#.....', '...#h#......', '..###.......', '.##.........', '##..........', '#...........'],
    'missiles': ['............', '##......hh..', '.###...hhhh.', '..##....hh..', '............', '##......hh..',
                 '.###...hhhh.', '..##....hh..', '............', '##......hh..', '.###...hhhh.', '..##....hh..'],
    'nosign': ['...######...', '..##....##..', '.##.....###.', '.#.....##.#.', '#.....##...#', '#....##....#',
               '#...##.....#', '#..##......#', '.###......#.', '.##......##.', '..##....##..', '...######...'],
    'boot': ['............', '...####.....', '...####.....', '...####.....', '...####.....', '...####.....',
             '...######...', '...########.', '..#########.', '..#########.', '..hhhhhhhhh.', '............'],
    'eye': ['............', '............', '....####....', '..##....##..', '.#..####..#.', '#..#hh..#..#',
            '#..#hh..#..#', '.#..####..#.', '..##....##..', '....####....', '............', '............'],
    'dagger': ['..........#.', '.........##.', '........#h#.', '.......#h#..', '......#h#...', '.....#h#....',
               '..#.#h#.....', '...###......', '...##.......', '..#..#......', '.#..........', '#...........'],
    'fan': ['#....#....#.', '#....#....#.', '.#...#...#..', '.#...#...#..', '..#..#..#...', '..#..#..#...',
            '...#.#.#....', '...#####....', '....###.....', '....###.....', '............', '............'],
    'hammer': ['..########..', '..#hhhhhh#..', '..########..', '..########..', '.....##.....', '.....##.....',
               '.....##.....', '.....##.....', '.....##.....', '.....##.....', '....####....', '............'],
    'skull': ['...######...', '..########..', '.##########.', '.##..##..##.', '.##..##..##.', '.##########.',
              '..###..###..', '...######...', '...#.##.#...', '............', '............', '............'],
    'hourglass': ['.##########.', '..#hhhhhh#..', '...#hhhh#...', '....#hh#....', '.....##.....', '.....##.....',
                  '....#..#....', '...#....#...', '..#..hh..#..', '.#.hhhhhh.#.', '.##########.', '............'],
    'orb': ['............', '....####....', '..##hh####..', '.##hh######.', '.#hh#######.', '.##########.',
            '.##########.', '.##########.', '..########..', '....####....', '............', '............'],
    'drop': ['.....#......', '.....##.....', '....####....', '....####....', '...######...', '..##h#####..',
             '..#hh#####..', '..#h######..', '..########..', '...######...', '....####....', '............'],
    'down': ['....####....', '....####....', '....####....', '....####....', '....####....', '.##########.',
             '..########..', '...######...', '....####....', '.....##.....', '............', '............'],
    'target': ['...######...', '..#......#..', '.#..####..#.', '#..#....#..#', '#.#..##..#.#', '#.#.####.#.#',
               '#.#.####.#.#', '#.#..##..#.#', '#..#....#..#', '.#..####..#.', '..#......#..', '...######...'],
    'fist': ['............', '..########..', '.#h#h#h#h##.', '.##########.', '.##########.', '.##########.',
             '.#########..', '..#######...', '...######...', '...######...', '...######...', '............'],
    'hand': ['....#.#.....', '..#.#.#.#...', '..#.#.#.#...', '..#.#.#.#...', '..#######.#.', '..#######.#.',
             '..#########.', '..########..', '...######...', '...######...', '....####....', '............'],
    'dots': ['............', '............', '.##..##..##.', '.##..##..##.', '............', '............',
             '....##..##..', '....##..##..', '............', '............', '............', '............'],
    'sun': ['.....##.....', '.#...##...#.', '..#......#..', '....####....', '...######...', '##.##hh##.##',
            '##.##hh##.##', '...######...', '....####....', '..#......#..', '.#...##...#.', '.....##.....'],
    'mask': ['............', '............', '.##########.', '############', '##..####..##', '##..####..##',
             '############', '.####..####.', '..##....##..', '............', '............', '............'],
    'exclaim': ['.....##.....', '....####....', '....####....', '....####....', '....####....', '.....##.....',
                '.....##.....', '............', '.....##.....', '....####....', '.....##.....', '............'],
    'sheep': ['............', '..##.##.##..', '.##########.', '############', '#########ooo', '#########ooo',
              '.########oo.', '..##.##.##..', '..o..o..o...', '..o..o..o...', '............', '............'],
}
G['up'] = list(reversed(G['down']))
G.update({
    'chest': ['............', '............', '..########..', '.#hhhhhhhh#.', '.#hhhhhhhh#.', '.##########.',
              '.####oo####.', '.####oo####.', '.##########.', '.##########.', '............', '............'],
    'bag': ['....####....', '.....##.....', '....####....', '...######...', '..########..', '.####hh####.',
            '.###h##h###.', '.###hh#####.', '.#####hh###.', '.###h##h###.', '..###hh###..', '...######...'],
    'campfire': ['............', '.....#......', '.....##.....', '....###..#..', '...#####.#..', '...##h####..',
                 '..###hh###..', '..##hhhh##..', '...######...', '.oo.oooo.oo.', '..oooooooo..', '............'],
    'crown': ['............', '............', '#....##....#', '##..####..##', '###.####.###', '############',
              '##hh##hh##hh', '############', '.##########.', '............', '............', '............'],
    'question': ['............', '....####....', '...######...', '..##....##..', '.......###..', '......###...',
                 '.....###....', '.....##.....', '............', '.....##.....', '.....##.....', '............'],
})
PALETTE['0'] = '#4a3420'  # wood / chest


def icon(glyph: str, bg: str, fg: str, hl: str = 'w') -> list[str]:
    rows = [['k'] * 14 for _ in range(14)]
    for y in range(1, 13):
        for x in range(1, 13):
            rows[y][x] = bg
    for y, row in enumerate(G[glyph]):
        assert len(row) == 12, f'{glyph} row {y} is {len(row)} wide'
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            rows[y + 1][x + 1] = {'#': fg, 'h': hl, 'o': 'k'}[ch]
    return [''.join(r) for r in rows]


# (glyph, background, colour[, highlight]) for every ability, passive pick, starting passive and effect.
ICONS = {
    # Warrior
    'ab-heroicStrike': ('sword', '1', 'm'), 'ab-thunderclap': ('bolt', '1', 'y'), 'ab-whirlwind': ('swirl', '1', 'm'),
    'ab-shieldBlock': ('shield', '1', 'm'), 'ab-shieldBash': ('star', '1', 'y'), 'ab-lastStand': ('heart', '1', 'r'),
    'ab-rallyingShout': ('banner', '1', 'f'), 'ab-taunt': ('exclaim', '1', 'y'),
    # Paladin
    'ab-judgement': ('sun', '2', 'g'), 'ab-radiantLight': ('cross', '2', 'g', 'L'), 'ab-hallowedGround': ('ring', '2', 'g', 'L'),
    'ab-mercy': ('heart', '2', 'L'), 'ab-hammerOfJustice': ('hammer', '2', 'm'), 'ab-exorcism': ('flame', '2', 'g', 'L'),
    # Priest
    'ab-heal': ('cross', '3', 'g'), 'ab-renew': ('leaf', '3', 'n'), 'ab-powerShield': ('shield', '3', 'c'),
    'ab-guardianSpirit': ('wings', '3', 'w', 'L'), 'ab-holyNova': ('ring', '3', 'L'), 'ab-chainOfLight': ('chain', '3', 'L'),
    'ab-fortitude': ('heart', '3', 'w'),
    # Mage
    'ab-fireball': ('flame', '4', 'f', 'F'), 'ab-iceLance': ('shard', '4', 'c'), 'ab-blizzard': ('snow', '4', 'c'),
    'ab-frostNova': ('ring', '4', 'c'), 'ab-arcaneBarrage': ('missiles', '4', 'a', 'c'), 'ab-counterspell': ('nosign', '4', 'c'),
    'ab-polymorph': ('sheep', '4', 'w'),
    # Warlock
    'ab-hexBolt': ('orb', '5', 'a', 'G'), 'ab-wither': ('skull', '5', 'G'), 'ab-soulDrain': ('drop', '5', 'G'),
    'ab-enfeeble': ('down', '5', 'a'), 'ab-doom': ('hourglass', '5', 'G'), 'ab-curseOfRuin': ('target', '5', 'x'),
    # Rogue
    'ab-sinisterStrike': ('dagger', '6', 'm'), 'ab-eviscerate': ('dagger', '6', 'r'), 'ab-kick': ('boot', '6', 'b', 'e'),
    'ab-evasion': ('swirl', '6', 'i'), 'ab-gouge': ('eye', '6', 'y'), 'ab-fanOfKnives': ('fan', '6', 'm'),
    # Passive picks
    'tr-rage': ('fist', '7', 'r'), 'tr-blessedHands': ('hand', '7', 'L'), 'tr-arcaneSurge': ('bolt', '7', 'c'),
    'tr-comboPoints': ('dots', '7', 'y'), 'tr-poisonedBlades': ('drop', '7', 'n'), 'tr-zeal': ('sun', '7', 'g'),
    'tr-agony': ('skull', '7', 'a'),
    # Starting passives
    'pa-autoTaunt': ('exclaim', '1', 'y'), 'pa-fortitudeAura': ('heart', '3', 'w'), 'pa-autoPolymorph': ('sheep', '4', 'w'),
    'pa-aegisAura': ('shield', '2', 'g', 'L'), 'pa-soulHarvest': ('skull', '5', 'G'), 'pa-stealth': ('mask', '6', 'i'),
    # Effects: buffs on teal, debuffs on dark red
    'ef-hot': ('leaf', '9', 'n'), 'ef-fortitude': ('heart', '9', 'w'), 'ef-stealth': ('mask', '9', 'i'),
    'ef-block': ('shield', '9', 'm'), 'ef-shield': ('ring', '9', 'c'), 'ef-evasion': ('swirl', '9', 'i'),
    'ef-empower': ('up', '9', 'f'), 'ef-guardian': ('wings', '9', 'w', 'L'), 'ef-frenzy': ('fist', '8', 'r'),
    'ef-dot': ('flame', '8', 'f', 'F'), 'ef-slow': ('snow', '8', 'c'), 'ef-sheep': ('sheep', '8', 'w'),
    'ef-silence': ('nosign', '8', 'c'), 'ef-weaken': ('down', '8', 'a'), 'ef-stun': ('star', '8', 'y'),
    'ef-vulnerable': ('target', '8', 'x'), 'ef-doom': ('hourglass', '8', 'G'),
    # Damage over time, by what caused it
    'ef-dot-wither': ('skull', '8', 'G'), 'ef-dot-sinisterStrike': ('drop', '8', 'r'), 'ef-dot-fanOfKnives': ('drop', '8', 'n'),
    'ef-dot-poison': ('drop', '8', 'n'), 'ef-dot-hexBolt': ('skull', '8', 'n'), 'ef-dot-exorcism': ('flame', '8', 'g', 'L'),
    # Map nodes, and gold
    'nd-fight': ('sword', '7', 'm'), 'nd-elite': ('skull', '8', 'i'), 'nd-chest': ('chest', '0', 'b', 'g'),
    'nd-campsite': ('campfire', '0', 'f', 'F'), 'nd-shop': ('bag', '9', 'b', 'g'), 'nd-boss': ('crown', '8', 'g', 'x'),
    'nd-event': ('question', '5', 'y'),
    'ui-gold': ('orb', '0', 'g', 'F'), 'ui-wish': ('star', '9', 'y'),
}


def icons() -> dict[str, list[str]]:
    return {f'icon-{k}': icon(*v) for k, v in ICONS.items()}


def main() -> None:
    grids = {k: f().rows() for k, f in SPRITES.items()}
    icon_grids = icons()
    used = {ch for rows in [*grids.values(), *icon_grids.values()] for r in rows for ch in r if ch != '.'}
    missing = used - set(PALETTE)
    assert not missing, f'letters missing from the palette: {missing}'

    # TypeScript module for the game.
    out = [
        '// Generated by art/sprites.py — edit that file, then run: python3 art/sprites.py',
        '/* eslint-disable */',
        '',
        '/** Letter -> colour for the pixel grids below. */',
        'export const PIXEL_PALETTE: Record<string, string> = {',
    ]
    for k in sorted(PALETTE):
        out.append(f"  {k!r}: '{PALETTE[k]}',".replace('"', "'"))
    out += ['};', '', '/** 32x32 pixel grids ("." is transparent), keyed by texture name. */', 'export const PIXEL_SPRITES: Record<string, string[]> = {']
    for k, rows in grids.items():
        out.append(f"  '{k}': [")
        for r in rows:
            out.append(f"    '{r}',")
        out.append('  ],')
    out += ['};', '', '/** 14x14 icons for abilities (icon-ab-*), passive picks (icon-tr-*), starting passives (icon-pa-*) and effects (icon-ef-*). */', 'export const PIXEL_ICONS: Record<string, string[]> = {']
    for k, rows in icon_grids.items():
        out.append(f"  '{k}': [")
        for r in rows:
            out.append(f"    '{r}',")
        out.append('  ],')
    out += ['};', '']
    with open(os.path.join(ROOT, 'src/render/pixelArt.ts'), 'w') as fh:
        fh.write('\n'.join(out))

    # Preview sheet.
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print('Pillow not installed: skipped the preview image')
        return
    scale, cols = 6, 7
    names = list(grids)
    rows_n = (len(names) + cols - 1) // cols
    cell = SIZE * scale + 16
    img = Image.new('RGBA', (cols * cell, rows_n * (cell + 18)), '#2a2d38')
    draw = ImageDraw.Draw(img)
    for i, name in enumerate(names):
        cx, cy = (i % cols) * cell, (i // cols) * (cell + 18)
        draw.rectangle([cx + 4, cy + 4, cx + cell - 4, cy + cell - 4], fill='#8a93a6')
        for y, r in enumerate(grids[name]):
            for x, ch in enumerate(r):
                if ch == '.':
                    continue
                x0, y0 = cx + 8 + x * scale, cy + 8 + y * scale
                draw.rectangle([x0, y0, x0 + scale - 1, y0 + scale - 1], fill=PALETTE[ch])
        draw.text((cx + 8, cy + cell), name.split('-', 1)[1], fill='#ffffff')
    img.save(os.path.join(ROOT, 'art/sprites-preview.png'))
    # Icons sheet, 5x, labelled.
    scale, cols = 5, 10
    names = list(icon_grids)
    cell_w, cell_h = 14 * scale + 60, 14 * scale + 22
    sheet = Image.new('RGBA', (cols * cell_w, ((len(names) + cols - 1) // cols) * cell_h), '#1b1d26')
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        cx, cy = (i % cols) * cell_w + 30, (i // cols) * cell_h + 4
        for y, r in enumerate(icon_grids[name]):
            for x, ch in enumerate(r):
                if ch == '.':
                    continue
                d.rectangle([cx + x * scale, cy + y * scale, cx + x * scale + scale - 1, cy + y * scale + scale - 1], fill=PALETTE[ch])
        d.text((cx - 26, cy + 14 * scale + 4), name[5:][:22], fill='#c9d1e0')
    sheet.save(os.path.join(ROOT, 'art/icons-preview.png'))
    print(f'wrote {len(grids)} sprites and {len(icon_grids)} icons')


if __name__ == '__main__':
    main()
