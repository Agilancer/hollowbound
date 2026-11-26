"""Level layouts, carved from rectangles, written to src/game/maps.js as ASCII.

    python tools/levels.py          # write maps.js and print the maps
    python tools/levels.py --check  # also run the reachability check

Tiles: # rock  = one-way plank  ^ spikes  % fake (secret) wall  | invisible barrier
Markers are listed in LEGEND below and become entities in src/game/levels.js.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LEGEND = {
    'P': 'player spawn', 'x': 'exit', 'g': 'green slime', 'b': 'blue slime', 'r': 'red slime',
    'z': 'ghoul', 'w': 'wraith', 'B': 'boss', 'c': 'chest', 'C': 'gold chest', 't': 'wall torch',
    'o': 'gold ore', 'd': 'diamond ore', 'H': 'hostage', 'f': 'campfire', 'G': 'boss gate',
    '$': 'coin', 'v': 'wisp', 's': 'sign', 'k': 'heart',
}


class Grid:
    def __init__(self, w, h, fill='#'):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]

    def rect(self, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.g[y][x] = ch

    def carve(self, x0, y0, x1, y1):
        self.rect(x0, y0, x1, y1, '.')

    def rock(self, x0, y0, x1, y1):
        self.rect(x0, y0, x1, y1, '#')

    def plank(self, x0, x1, y):
        self.rect(x0, y, x1, y, '=')

    def put(self, x, y, ch):
        self.g[y][x] = ch

    def rows(self):
        return [''.join(r) for r in self.g]


def cave():
    c = Grid(100, 42)
    # A: entrance hall (floor row 12, raised to 11 further in)
    c.carve(1, 4, 27, 11)
    c.rock(8, 4, 10, 5)
    c.rock(17, 4, 19, 6)
    c.rock(13, 11, 27, 11)
    # B: east corridor (rows 6-10, floor 11), spike pit split by a pillar
    c.carve(27, 6, 80, 10)
    c.carve(33, 4, 46, 5)  # headroom over the pit jumps
    c.carve(36, 11, 43, 12)
    c.rock(39, 10, 40, 12)
    c.rect(36, 12, 38, 12, '^')
    c.rect(41, 12, 43, 12, '^')
    # B upper chamber with the first chest: notch + ledge, then up through a plank
    c.carve(50, 2, 54, 5)
    c.plank(50, 53, 8)
    c.carve(55, 1, 64, 4)
    c.plank(55, 56, 5)
    # C: east shaft (x 80-93, rows 5-25, floor 26)
    c.carve(80, 5, 93, 25)
    c.plank(81, 84, 14)
    c.plank(88, 91, 17)
    c.plank(81, 84, 20)
    c.plank(88, 91, 23)
    c.rock(92, 5, 93, 8)
    # D: middle corridor heading west (rows 21-25, floor 26)
    c.carve(36, 21, 79, 25)
    c.rock(46, 21, 47, 22)
    c.rock(70, 21, 72, 21)
    # D alcove with chest 2 (floor 21 with a plank way in)
    c.carve(56, 16, 69, 20)
    c.plank(55, 58, 24)
    c.plank(56, 61, 21)
    c.rock(62, 21, 69, 21)
    # hole down to E, plus a plank ladder for the climb back
    c.carve(36, 26, 40, 30)
    # E: lower-west chamber (rows 30-35, floor 36) with a secret room behind a fake wall
    c.carve(9, 30, 40, 35)
    c.carve(14, 27, 30, 29)
    c.rect(7, 31, 8, 35, '%')
    c.carve(1, 30, 6, 35)
    c.rock(20, 35, 21, 35)
    c.plank(36, 38, 27)  # plank ladder back up to D
    c.plank(37, 40, 30)
    c.plank(33, 36, 33)
    # F: bottom corridor east (rows 31-35, floor 36), spike pit with a plank bridge, chest nook
    c.carve(40, 31, 72, 35)
    c.carve(50, 36, 55, 37)
    c.rect(50, 37, 55, 37, '^')
    c.plank(50, 55, 34)
    c.rock(62, 34, 63, 35)
    c.carve(63, 27, 68, 30)
    c.plank(64, 66, 31)
    c.rock(67, 31, 71, 31)    # stone hearth under the last fire, run into the wall so it is a ledge
    # boss arena (x 73-97, rows 26-35, floor 36)
    c.carve(73, 27, 97, 35)
    c.plank(77, 80, 33)
    c.plank(90, 93, 33)
    c.rect(72, 31, 72, 35, '|')  # gate (a barrier tile the boss fight toggles)

    m = c.put
    m(2, 11, 'P'); m(1, 11, 'x'); m(4, 11, 's')
    m(5, 8, 't'); m(15, 8, 't'); m(25, 7, 't')
    m(22, 10, 'g')
    m(33, 9, 't'); m(48, 10, 'g'); m(60, 10, 'b'); m(52, 9, 't'); m(70, 9, 't')
    m(62, 4, 'c'); m(59, 2, 't')
    m(64, 10, '$'); m(66, 10, '$'); m(68, 10, '$')
    m(86, 10, 'v'); m(93, 12, 't'); m(80, 19, 't'); m(90, 22, 'o'); m(86, 25, 'b'); m(92, 25, '$')
    m(65, 25, 'z'); m(58, 24, 't'); m(44, 25, 'o'); m(50, 25, 'd'); m(76, 23, 't')
    m(68, 20, 'c'); m(64, 18, 't')
    m(42, 23, 'v')
    m(24, 35, 'f'); m(11, 35, 'z'); m(38, 35, 'g'); m(12, 33, 't'); m(34, 32, 't'); m(16, 35, 'o')
    m(3, 35, 'c'); m(5, 32, 'v')
    m(46, 35, 'r'); m(51, 32, 'w'); m(61, 35, 'b'); m(65, 30, 'c'); m(67, 30, 'f'); m(45, 32, 't'); m(60, 32, 't')
    m(52, 33, '$'); m(53, 33, '$')
    m(87, 35, 'B'); m(75, 30, 't'); m(85, 28, 't'); m(95, 30, 't')
    m(95, 35, 'H'); m(91, 35, 'C')
    return c.rows()


def town():
    W, H = 152, 26
    c = Grid(W, H, '.')
    surface = [19] * W
    for x in range(26, 59): surface[x] = 20
    for x in range(59, 71): surface[x] = 23   # creek bed
    for x in range(71, 102): surface[x] = 20
    for x in range(102, 112): surface[x] = 19
    for x in range(112, 122): surface[x] = 18
    for x in range(122, W): surface[x] = 17
    for x in range(W):
        c.rock(x, surface[x], x, H - 1)
    c.plank(57, 72, 20)   # bridge
    # cliff over the cave mouth, tunnel carved into it
    # stepped hill over the cave mouth; the tunnel runs under it from x=134
    c.rock(139, 3, W - 1, 5)
    c.rock(137, 6, W - 1, 8)
    c.rock(134, 9, W - 1, 11)
    m = c.put
    m(149, 16, 'x')
    m(8, 18, 'P')
    return c.rows()


def emit(maps):
    out = ['// Generated by tools/levels.py - edit there, then re-run.', 'export const MAPS = {']
    for name, rows in maps.items():
        out.append(f'  {name}: [')
        out.extend(f"    '{r}'," for r in rows)
        out.append('  ],')
    out.append('};')
    path = os.path.join(ROOT, 'src', 'game', 'maps.js')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')


# ------------------------------------------------------------ reachability check
SOLID = set('#|')


def check(rows, start, jump=3, gap=4):
    """Flood fill over standing spots with simple jump rules: up to `jump` tiles up within
    `gap` tiles across, any drop. Returns the set of reachable standing tiles."""
    H, W = len(rows), len(rows[0])

    def solid(x, y):
        return x < 0 or x >= W or (0 <= y < H and rows[y][x] in SOLID)

    def stand(x, y):
        if not (0 <= y + 1 < H) or rows[y][x] == '^':
            return False
        if not (rows[y + 1][x] in SOLID or rows[y + 1][x] == '='):
            return False
        return all(y - k >= 0 and not solid(x, y - k) for k in range(3))

    seen, todo = set(), [start]
    while todo:
        x, y = todo.pop()
        if (x, y) in seen or not stand(x, y):
            continue
        seen.add((x, y))
        for dx in range(-gap, gap + 1):
            for dy in range(-jump, H):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and stand(nx, ny):
                    top = min(y, ny)
                    if all(not solid(xx, yy) for xx in range(min(x, nx), max(x, nx) + 1) for yy in range(top - 2, top + 1)):
                        todo.append((nx, ny))
    return seen


if __name__ == '__main__':
    maps = {'town': town(), 'cave': cave()}
    emit(maps)
    for n, rows in maps.items():
        print(n, len(rows[0]), 'x', len(rows))
        for i, r in enumerate(rows):
            print(f'{i:2d} {r}')
    if '--check' in sys.argv:
        rows = [r.replace('|', '.') for r in maps['cave']]
        start = next((x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == 'P')
        seen = check(rows, start)
        miss = [(ch, x, y) for y, r in enumerate(rows) for x, ch in enumerate(r)
                if ch in 'cCHfBzgbrodk$' and (x, y) not in seen]
        print('unreachable markers:', miss or 'none')
        camp = next((x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == 'f')
        print('exit reachable from campfire:', start in check(rows, camp))
