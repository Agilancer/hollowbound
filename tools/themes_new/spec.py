"""Classification spec for src/data/themes.js (hand-made by looking at contact sheets; see README.md).

Sprite codes:  e04#5 = env sheet 04, object 5 | a02#8 = acres sheet 02 | d13#4 = dng40 sheet 13 | x091#2 = dng100 sheet 091
Prop line:     "<code> <h> <layer> <on> <weight> [light]"   light = a LIGHTS key
Ledge/bridge:  "<code>" or "<code> ay=<y>" to override the computed walkable-top y (px inside the rect)
Tiles:         "s_005" (prefix of an s_ id) or "m_048_6" (set number + variant)
"""
LIGHTS = {'warm': [1.0, 0.78, 0.42], 'fire': [1.0, 0.62, 0.25], 'green': [0.45, 1.0, 0.35], 'amber': [1.0, 0.7, 0.3],
          'violet': [0.7, 0.5, 1.0], 'crystal': [0.8, 0.65, 1.0], 'pale': [1.0, 0.92, 0.7]}

THEMES = {
 'town': dict(
  ground=('s_005', 's_028'), ledge=('s_015', 'wood'), backwall=None,
  ledges='e02#16 e02#17 e02#18 e02#19 e12#16 e12#18 e12#19 e01#16', bridges='e12#6 e01#6', ladders='e03#8 a02#6', doors='e12#12',
  props='''e01#1 420 back ground 2|e03#0 330 back ground 1|e02#6 300 back ground 1|e02#14 210 back ground 1|e12#9 150 back ground 2
   e12#0 250 back ground 1|e12#3 240 back ground 1|e01#9 150 back ground 1|e01#8 75 back ground 2|e03#9 80 back ground 1|a04#9 60 back ground 1
   e02#0 200 mid ground 1|e02#1 230 mid ground 2|e02#2 115 mid ground 2|e02#3 80 mid ground 3|e02#4 85 mid ground 1|e02#9 175 mid ground 4 warm
   e12#1 200 mid ground 2 warm|e02#12 170 mid ground 1|e02#13 55 mid ground 2|e01#0 160 mid ground 1|e12#2 150 mid ground 1|e03#4 150 mid ground 1
   x008#2 105 mid ground 2|a04#2 48 front ground 2|e02#3 52 front ground 1'''),
 'wilds': dict(
  ground=('s_022', 's_021'), ledge=('s_044', 'wood'), backwall=None,
  ledges='a01#9 a03#9 a05#9 a05#1 a03#1 e03#15 e03#19 a02#1', bridges='e01#6 e03#16', ladders='a02#8 a02#6', doors='a04#7',
  props='''e03#0 330 back ground 2|e01#2 400 back ground 2|e03#1 210 back ground 2|a03#7 280 back ground 1|a03#5 190 back ground 1|a03#8 180 back ground 1
   e03#13 170 back ground 2|e03#14 150 back ground 1|a01#8 220 back ground 1|a05#8 220 back ground 1|a04#6 150 back ground 1|e03#6 80 back ground 3
   e03#5 80 back ground 1|e03#7 80 back ground 1|e03#9 85 back ground 1|a04#5 140 back ground 1|a04#3 100 back ground 3|a01#6 110 back ground 1|a01#7 110 back ground 1
   a03#6 90 back ground 1|a04#0 210 mid ground 2|a04#1 105 mid ground 1|a04#8 190 mid ground 1|e03#3 170 mid ground 1|e03#4 165 mid ground 2
   e03#2 110 mid ground 2|a04#9 70 mid ground 1|e09#4 190 mid ground 1 warm|a05#3 150 back hang 2|a04#2 50 front ground 2|a04#4 60 front ground 3|a04#3 70 front ground 1'''),
 'forest': dict(
  ground=('s_023', 's_024'), ledge=('s_040', 'root'), backwall=None,
  ledges='e04#13 e04#14 e04#15 e04#16 e04#17 a05#5 d33#0 d16#0', bridges='e04#5 e01#6', ladders='e04#6 a05#6', doors='e04#1',
  props='''e04#0 460 back ground 3|e04#2 440 back ground 3|e01#1 430 back ground 2|e09#0 400 back ground 1|e04#7 480 back ground 1|e04#1 330 back ground 1
   e04#3 180 back ground 2|e03#1 220 back ground 1|e04#11 100 back ground 2|e04#4 80 back ground 4|d16#4 210 back ground 1|a04#8 180 back ground 1|a04#7 200 back ground 1
   e04#10 90 mid ground 2|e04#12 210 mid ground 2 amber|d16#3 130 mid ground 1 fire|d33#3 100 mid ground 1 amber|e03#3 165 mid ground 1|a03#5 180 mid ground 1
   x093#2 130 mid ground 1|e03#2 100 mid ground 1|a05#3 150 back hang 2|e04#4 55 front ground 3|a04#4 55 front ground 2'''),
 'graveyard': dict(
  ground=('s_001', 's_026'), ledge=('m_002_1', 'stone'), backwall=None,
  ledges='e05#15 e05#16 e05#17 e05#18 e05#19 d04#2 d40#0 d01#0', bridges='e17#6 e12#6', ladders='e03#8', doors='e05#12 e05#7',
  props='''e05#3 430 back ground 3|e01#2 400 back ground 2|e05#11 400 back ground 1|e05#13 300 back ground 1|e05#7 240 back ground 1|e05#5 125 back ground 2
   e05#6 130 back ground 1|e05#2 175 back ground 2|e17#2 250 back ground 1|d08#3 250 back ground 1|e12#0 240 back ground 1|e05#14 100 back ground 1|e05#8 90 back ground 2
   e05#0 125 mid ground 4|e05#1 110 mid ground 2|d01#3 100 mid ground 1|e05#4 200 mid ground 2 warm|d04#3 150 mid ground 1|d04#5 130 mid ground 1 warm
   d01#5 165 mid ground 1 warm|d40#3 100 mid ground 1|d40#5 70 mid ground 2|e17#1 160 mid ground 1|x090#2 200 mid ground 1|x090#3 210 mid ground 1 warm
   d40#5 45 front ground 1|a04#4 55 front ground 2'''),
 'catacombs': dict(
  ground=('s_007', 's_009'), ledge=('s_008', 'bone'), backwall=('s_003', [0.62, 0.56, 0.5]),
  ledges='e07#15 e07#16 e07#17 e07#18 e07#19 d01#2 d02#1 d01#0', bridges='e17#6', ladders='d02#3', doors='e07#12',
  props='''e07#0 260 back ground 2|e07#14 250 back ground 1|e07#13 230 back ground 1|e07#2 220 back ground 1|e07#5 110 back ground 1|e07#6 110 back ground 2
   e07#7 110 back ground 1|d01#4 190 back ground 2|d02#4 250 back ground 2|d02#5 120 back ground 1|e07#9 230 back ground 1
   e07#1 110 mid ground 2|d01#3 100 mid ground 1|e07#3 200 mid ground 2 warm|d01#5 165 mid ground 2 warm|d04#3 150 mid ground 1|d04#5 130 mid ground 1 warm
   x046#2 110 mid ground 1|x091#2 180 mid ground 1|d40#5 70 mid ground 2|e07#4 80 back wall 3 warm|e07#11 150 back wall 2|x046#3 150 back wall 1
   d03#5 170 back wall 1 fire|d08#5 180 back hang 1|d37#5 200 back hang 2 warm|d40#5 40 front ground 2'''),
 'sewers': dict(
  ground=('s_042', 's_041'), ledge=('s_017', 'iron'), backwall=('m_009_1', [0.5, 0.58, 0.46]),
  ledges='e06#15 e06#16 e06#17 e06#18 e06#19 d09#1 d11#2 d35#0', bridges='e06#5 ay=86', ladders='e06#7 d09#3', doors='e06#11',
  props='''e06#0 200 back wall 2|e06#3 200 back wall 2|e06#12 200 back wall 1|e06#13 190 back wall 1|e06#14 180 back wall 1|d09#4 130 back wall 2
   d12#5 60 back wall 2|d35#3 100 back wall 1|x065#3 150 back wall 1|x061#2 170 back wall 1
   e06#1 170 back ground 2|e06#2 170 back ground 2|e06#4 230 back ground 2 green|d10#4 180 back ground 1|d10#5 190 back ground 1|d12#3 180 back ground 1|x061#3 170 back ground 1
   e06#8 85 mid ground 3|d09#5 105 mid ground 2|d10#3 170 mid ground 1|d12#1 140 mid ground 1|d12#4 190 mid ground 1|x062#3 150 mid ground 1|x062#2 160 mid ground 1
   x063#3 140 mid ground 1|x063#2 150 mid ground 1 warm|x012#3 110 mid ground 1|d11#4 170 back hang 2|d35#4 170 back hang 2 amber'''),
 'march': dict(
  ground=('s_025', 's_043'), ledge=('s_045', 'wood'), backwall=None,
  ledges='e09#15 e09#16 e09#17 e09#18 e09#19 e09#6 a05#1 d34#1', bridges='e01#6 e08#6', ladders='a02#8 a02#7', doors='e09#12',
  props='''e09#0 400 back ground 3|e01#2 400 back ground 2|e05#3 420 back ground 2|e09#14 380 back ground 1|e09#12 270 back ground 1|e09#13 190 back ground 2
   e09#9 110 back ground 2|e09#1 110 back ground 4|a04#6 150 back ground 1|a03#7 260 back ground 1|e03#1 200 back ground 1|a03#8 180 back ground 1
   e09#2 140 mid ground 2|e09#3 140 mid ground 2|e09#4 195 mid ground 3 warm|a04#0 200 mid ground 1|a04#1 100 mid ground 1|d34#5 160 mid ground 1 warm
   e03#3 165 mid ground 1|a04#8 180 mid ground 1|a03#5 170 mid ground 1|a05#3 150 back hang 1|e09#1 70 front ground 3|a04#4 55 front ground 2'''),
 'castle': dict(
  ground=('s_003', 's_006'), ledge=('s_005', 'stone'), backwall=None,
  ledges='e10#16 e10#17 e10#18 e10#19 e01#15 e01#17 e01#18 e01#19', bridges='e17#6 e01#6', ladders='d13#4', doors='e10#12 e01#13',
  props='''e01#14 460 back ground 1|e17#14 420 back ground 1|e01#12 300 back ground 2|e10#5 200 back ground 2|e10#14 330 back ground 1|e10#13 280 back ground 1
   e10#6 180 back ground 1|e10#7 180 back ground 1|e10#3 150 back ground 1|e10#4 200 back ground 1|e10#9 260 back ground 1|e17#9 330 back ground 1
   e17#5 200 back ground 1|e17#7 200 back ground 1|e01#2 400 back ground 1|e01#9 150 back ground 1|e17#2 250 back ground 1
   e10#1 135 mid ground 3 fire|e01#4 175 mid ground 2 warm|e17#0 220 mid ground 2|e17#4 150 mid ground 2|e17#1 160 mid ground 1|e01#0 160 mid ground 1
   e01#8 75 mid ground 1|x007#3 150 mid ground 1|x010#2 140 mid ground 1|x009#1 120 mid ground 1|x008#2 105 mid ground 2|e10#2 200 back hang 2
   d40#5 45 front ground 2|d07#3 60 front ground 1'''),
 'caves': dict(
  ground=('s_085', 's_030'), ledge=('s_057', 'stone'), backwall=('s_036', [0.55, 0.58, 0.68]),
  ledges='e08#14 e08#16 e08#17 e08#18 e08#19 d15#0 d14#0 d13#1', bridges='e08#5 e08#6', ladders='d13#4 a02#6', doors='e08#11',
  props='''e08#1 250 back ground 3|e08#13 320 back ground 2|e08#11 260 back ground 1|e08#12 240 back ground 1|e08#7 220 back ground 1|d15#3 170 back ground 3
   d15#5 170 back ground 1|e08#2 160 mid ground 2 amber|e08#3 220 mid ground 3 warm|d13#3 110 mid ground 2|d13#5 190 mid ground 2 warm|d14#3 150 mid ground 2 crystal
   d15#4 70 mid ground 3|d16#3 130 mid ground 1 fire|d16#4 200 mid ground 1|x039#2 150 mid ground 1|x039#3 150 mid ground 1|x040#2 140 mid ground 1
   x040#3 100 mid ground 1|x041#3 150 mid ground 1|a03#5 170 mid ground 1|e08#0 190 back hang 3 crystal|d15#4 45 front ground 2'''),
 'breach': dict(
  ground=('s_057', 's_059'), ledge=('s_055', 'stone'), backwall=None,
  ledges='e16#15 e16#16 e16#17 e16#18 e16#19 d23#1 d21#0 d32#0', bridges='e16#6', ladders='e16#9', doors='e16#12',
  props='''e16#0 400 back ground 3|e16#13 300 back ground 2|e16#14 260 back ground 1|e16#12 330 back ground 1|e17#7 200 back ground 1|e17#8 220 back ground 1
   e17#13 280 back ground 1|d23#5 190 back ground 2|d24#3 190 back ground 1|d21#4 200 back ground 1 fire|e13#12 380 back ground 1
   e16#1 130 mid ground 2|e16#2 170 mid ground 1|e16#3 150 mid ground 3|e16#4 210 mid ground 3 fire|e16#8 90 mid ground 2|d23#3 140 mid ground 1
   d23#4 135 mid ground 2 fire|d22#5 130 mid ground 1 fire|e17#1 160 mid ground 1|e17#0 220 mid ground 1|x100#2 180 mid ground 1|x100#3 150 mid ground 1 fire
   d32#3 170 mid ground 1|d21#5 170 back hang 1 fire|d40#5 45 front ground 2|d07#3 60 front ground 1'''),
 'hall': dict(
  ground=('s_080', 's_077'), ledge=('s_015', 'wood'), backwall=('s_072', [0.5, 0.46, 0.42]),
  ledges='e11#14 e11#15 e11#16 e11#17 e11#18 e11#19 d39#0 d37#1', bridges='', ladders='a02#8 a02#6', doors='e11#11',
  props='''e11#10 210 back wall 2|e11#13 230 back wall 2 pale|e15#2 220 back wall 1|e13#2 150 back wall 2|d39#3 200 back wall 2 fire
   e11#3 220 back hang 2|e13#3 220 back hang 1|d37#5 200 back hang 2 warm
   e11#12 330 back ground 2|e11#1 230 back ground 1|e11#2 240 back ground 1|e11#8 220 back ground 1|e11#5 110 back ground 2|d37#3 220 back ground 1
   x087#2 220 back ground 1|e15#4 260 back ground 1|e11#0 150 mid ground 2 fire|e13#0 170 mid ground 2 warm|e15#1 185 mid ground 1 warm|e15#3 130 mid ground 1
   d37#4 130 mid ground 1|d06#3 120 mid ground 1|d06#4 170 mid ground 2|x085#3 70 mid ground 1|x086#2 170 mid ground 1|x089#2 100 mid ground 1
   x089#3 160 mid ground 1|x098#3 120 mid ground 1 warm|x098#2 190 mid ground 1|x004#2 170 mid ground 1'''),
 'arena': dict(
  ground=('s_068', 's_006'), ledge=('s_016', 'wood'), backwall=('s_012', [0.42, 0.36, 0.32]),
  ledges='e17#15 e17#16 e17#18 e17#19 d06#0 d06#1 d38#0 d07#2', bridges='e17#6', ladders='d13#4', doors='e17#12',
  props='''e17#3 190 back wall 3 fire|e13#6 150 back wall 2|x097#3 160 back wall 2|x099#3 160 back wall 1|d05#4 150 back wall 1|e13#2 150 back wall 1|d06#2 170 back wall 1
   e10#2 200 back hang 2|d08#5 180 back hang 2|x011#2 140 back hang 1|d22#3 190 back hang 1
   x088#2 200 back ground 1|x094#3 190 back ground 1|x009#1 120 back ground 2|x009#2 150 back ground 1|e17#13 280 back ground 1
   e17#4 150 mid ground 3|e17#0 220 mid ground 2|e10#1 135 mid ground 3 fire|d06#3 120 mid ground 2|d06#4 170 mid ground 1|d06#5 115 mid ground 1
   d07#5 150 mid ground 1|x097#2 130 mid ground 2|x088#3 150 mid ground 1|x094#2 130 mid ground 1|x010#3 70 mid ground 1|x008#2 105 mid ground 1
   d37#4 130 mid ground 1|d40#5 40 front ground 1'''),
 'barrow': dict(
  ground=('s_021', 's_042'), ledge=('s_089', 'root'), backwall=('s_024', [0.42, 0.48, 0.36]),
  ledges='d33#0 d34#1 d34#2 d34#3 a05#1 a05#9 d16#2 x093#1', bridges='', ladders='a05#6 e04#6', doors='d33#4',
  props='''a01#8 220 back ground 2|a05#8 220 back ground 1|d33#4 200 back ground 2|d34#4 180 back ground 1|d36#4 170 back ground 1|d36#5 190 back ground 1
   d36#3 190 back ground 1|d16#4 200 back ground 2|a04#8 180 back ground 1|a03#5 180 back ground 2|a03#7 260 back ground 1|a03#8 180 back ground 1
   e04#3 170 back ground 1|x093#2 130 back ground 1|d33#3 100 mid ground 2 amber|d16#3 130 mid ground 2 fire|d34#5 160 mid ground 3 warm|e04#10 85 mid ground 1
   e04#4 70 mid ground 3|x093#3 90 mid ground 1|d01#3 95 mid ground 1|e09#13 180 mid ground 1|a05#3 160 back hang 4|e04#4 50 front ground 2|a04#4 50 front ground 2'''),
 'cistern': dict(
  ground=('s_097', 's_099'), ledge=('s_019', 'iron'), backwall=('s_042', [0.5, 0.62, 0.64]),
  ledges='d11#0 d09#1 d11#2 d03#0 d03#2 d35#2 x065#1 x012#1', bridges='e06#5 ay=86', ladders='d09#3 e06#7', doors='e06#11',
  props='''d11#5 170 back wall 2|d03#4 130 back wall 2|x012#2 150 back wall 2|x061#3 170 back wall 1|e06#3 200 back wall 1|e06#14 180 back wall 1
   d35#5 170 back wall 1|x065#3 150 back wall 1|d03#5 170 back wall 2 fire
   d11#3 210 back ground 3|d10#5 190 back ground 1|d10#4 180 back ground 1|d12#3 180 back ground 1|x066#2 200 back ground 1|e06#4 230 back ground 1 green
   d10#3 170 mid ground 2|d12#4 190 mid ground 2|d12#1 140 mid ground 1|d03#3 65 mid ground 2|x063#3 140 mid ground 2|x063#2 150 mid ground 1 warm
   x062#3 150 mid ground 1|x005#2 130 mid ground 1|x012#3 110 mid ground 1|e06#8 85 mid ground 2|d11#4 170 back hang 2|d35#4 170 back hang 2 amber'''),
 'ossuary': dict(
  ground=('s_010', 's_039'), ledge=('s_091', 'bone'), backwall=('s_008', [0.46, 0.42, 0.36]),
  ledges='d02#1 d01#2 d04#2 e07#17 e07#19 d40#2 x046#0 e15#17', bridges='', ladders='a02#8 d02#3', doors='e15#11',
  props='''e07#4 80 back wall 3 warm|e07#11 150 back wall 2|x046#3 150 back wall 2|e15#0 170 back wall 2 warm|e15#2 220 back wall 1|d40#4 230 back wall 1
   x044#3 150 back wall 1|x044#2 200 back wall 1|d01#4 190 back ground 2|e07#0 260 back ground 1|d02#4 250 back ground 3|d02#5 120 back ground 2
   d04#0 110 back ground 1|e07#2 220 back ground 1|d04#4 120 mid ground 2|d04#5 130 mid ground 2 warm|d04#3 150 mid ground 1|d01#3 100 mid ground 2
   d01#5 165 mid ground 2 warm|e15#1 185 mid ground 1 warm|e15#3 130 mid ground 1|x045#1 170 mid ground 1|x045#2 170 mid ground 1|x046#2 110 mid ground 1
   x090#2 200 mid ground 1|x091#2 180 mid ground 1|d37#5 200 back hang 1 warm|x043#3 200 back hang 1'''),
 'gatehouse': dict(
  ground=('s_020', 's_013'), ledge=('s_083', 'iron'), backwall=('s_005', [0.5, 0.47, 0.5]),
  ledges='d05#0 d05#2 d08#1 d08#2 e13#14 e13#15 e13#18 d06#0', bridges='e12#6', ladders='e06#7 d09#3', doors='e13#11',
  props='''d05#4 150 back wall 2|e13#6 150 back wall 2|e13#2 150 back wall 1|e13#4 220 back wall 1|x097#3 160 back wall 2|x099#3 160 back wall 1
   d39#3 200 back wall 2 fire|d06#2 170 back wall 1|e17#3 190 back wall 2 fire|e13#3 220 back hang 2|d08#5 180 back hang 2|d37#5 200 back hang 1 warm
   x011#2 140 back hang 1|d22#3 190 back hang 1|d05#1 120 back ground 1|d08#3 260 back ground 1|d08#4 240 back ground 1|e13#13 440 back ground 1
   e13#7 130 back ground 2|d05#3 140 mid ground 2|d05#5 180 mid ground 3 warm|e13#0 170 mid ground 1 warm|d06#3 120 mid ground 2|d06#4 170 mid ground 2
   d06#5 115 mid ground 1|d07#0 90 mid ground 1|d07#4 75 mid ground 1|d07#3 70 mid ground 1|x007#2 130 mid ground 1|x008#2 105 mid ground 2
   x010#2 140 mid ground 1|x097#2 130 mid ground 1|e10#1 135 mid ground 2 fire'''),
 'vault': dict(
  ground=('s_081', 's_029'), ledge=('s_092', 'bone'), backwall=('m_003_2', [0.4, 0.34, 0.46]),
  ledges='d02#1 d01#2 d36#0 d36#2 e07#15 e07#17 d33#5 x091#0', bridges='', ladders='d02#3', doors='d39#5',
  props='''e07#11 160 back wall 3|e07#4 80 back wall 2 warm|d03#5 170 back wall 2 fire|e13#6 150 back wall 1|d24#4 150 back wall 1
   d08#5 180 back hang 2|d21#5 170 back hang 1 fire|d37#5 200 back hang 1 warm
   d02#4 260 back ground 3|d02#5 120 back ground 2|d36#3 190 back ground 1|d36#5 190 back ground 1|d36#4 170 back ground 1|e07#0 260 back ground 1
   e07#14 250 back ground 1|d01#4 190 back ground 2|d39#4 240 back ground 1|x091#2 180 mid ground 3|x090#2 200 mid ground 2|x090#3 210 mid ground 2 warm
   d01#3 100 mid ground 1|e07#1 110 mid ground 2|d32#6 200 mid ground 1 violet|d32#3 170 mid ground 1|d23#3 140 mid ground 1|e07#3 200 mid ground 1 warm
   d01#5 165 mid ground 1 warm|d40#5 70 mid ground 1|d40#5 45 front ground 2'''),
}

# facade (town + castle): old surface path (basename) -> new tile
FACADE_TILES = {
 'town_wall_oak_plaster': 'm_040_6', 'town_wall_wattle_daub': 'm_048_6', 'town_wall_town_brick': 's_053', 'town_wall_fieldstone': 's_005',
 'town_wall_dressed_limestone': 's_072', 'town_wall_pine_siding': 's_015',
 'town_roof_oak_shingles': 's_016', 'town_roof_blue_slate': 's_046', 'town_roof_terracotta': 's_069', 'town_roof_straw_thatch': 's_068',
 'masonry_fieldstone_03': 's_028', 'town_dark_pine': 's_016',
 'masonry_grey_ashlar_01': 's_005', 'masonry_grey_ashlar_05': 's_001', 'masonry_slate_03': 's_003', 'masonry_blackstone_02': 's_020',
 'masonry_mossy_ashlar_02': 'm_009_1', 'castle_roof_black': 's_057', 'castle_roof_blue': 's_046', 'castle_roof_char': 's_055',
 'castle_roof_violet': 's_081', 'masonry_blackstone_05': 's_006', 'met_02_riveted_black_iron': 's_017',
}
