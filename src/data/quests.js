// VELSCOUR : HOLLOWBOUND — quests. Mob ids are bestiary ids; npc and map ids come from npcs.js / world.js.
// Step types: kill {mob|area|any, n} · collect {item, from: mobId|{area}, n, chance} · talk {npc} · visit {map} · boss {mob}
//             dungeon {id} · level {n} · deliver {npc, item}
// Validate with: node tools/check_content.mjs

export const xpToNext = (L) => Math.round((45 * L * L + 35 * L) * (1 + Math.pow(L / 25, 1.25)));

// reward helper: xp = mult × xpToNext(level) (kept within 0.6-1.2), gold scales with level.
const rw = (level, mult, item = null, skillPoint = 0) => ({
  xp: Math.round(xpToNext(level) * mult / 5) * 5,
  gold: Math.round((20 + level * 28) * (0.6 + mult * 0.5) / 5) * 5,
  item, skillPoint,
});
const gear = (slot, rarity) => ({ slot, rarity });

export const QUESTS = [
  // ═════════════════════════════ MAIN CHAIN ═════════════════════════════
  { id: "q_first_blood", name: "Something That Should Have Stayed Dead", giver: "tobin", turnin: "tobin", level: 1, after: null, area: "wilds", main: true,
    offer: [
      "New, are you? You've the look. Clean boots and all your fingers.",
      "There's gravehounds on the Hollow Road again. Lean ones. Harmless, if you're a fence post.",
      "Go and burst eight of them. It's not glory, but glory's got to start somewhere, and it generally starts in muck.",
    ],
    progress: ["Eight, I said. I can count, you know. It's fingers I'm short of, not numbers."],
    done: [
      "There. You've killed something that wobbled. Soldiers have been decorated for less.",
      "Take this. Don't spend it at Fortunato's table. I'll know. Everybody will know. He rings a little bell.",
    ],
    steps: [ { t: "kill", mob: "gravehound", n: 8 } ],
    reward: rw(1, 1.2, gear("weapon", 0)) },

  { id: "q_scouts_arithmetic", name: "The Scout's Arithmetic", giver: "tobin", turnin: "mira", level: 2, after: "q_first_blood", area: "wilds", main: true,
    offer: [
      "Mira Thistle's been counting goblins out at Fallow Acres. She wants somebody to help her count downward.",
      "The sneaks carry tally-sticks. One notch a theft. Bring her five and she'll know how hungry the ditch is getting.",
      "She's over by the well, pretending not to watch everyone.",
    ],
    progress: ["The sticks are notched. If it isn't notched, you've mugged a goblin for kindling."],
    done: [
      "Five sticks. Forty-odd notches apiece. That's not raiding, that's a census.",
      "Somebody's organising them. Goblins don't organise. They barely queue.",
    ],
    steps: [ { t: "collect", item: "Notched Tally-Stick", from: "scrapknife_sneak", n: 25, chance: 0.6 }, { t: "talk", npc: "mira" } ],
    reward: rw(2, 1.0, "potions") },

  { id: "q_listening_straw", name: "Rows of Listening Straw", giver: "mira", turnin: "nan", level: 3, after: "q_scouts_arithmetic", area: "wilds", main: true,
    offer: [
      "West of the Acres there's a field of scarecrows nobody planted. I counted sixty. On the way back I counted sixty-two.",
      "A hedge witch lives in the middle of it. Nan Bramble. She's either the cause or the only reason it isn't worse.",
      "Walk out to Scarecrow Rows and ask her which.",
    ],
    progress: ["West. Past the shepherd with no sheep. If the scarecrows turn to watch you, you're close."],
    done: [
      "Mira sent you? Sharp girl. Walks like a ghost. I've met ghosts with heavier feet.",
      "No, dearie, they're not mine. Sit down. This wants tea, and then it wants a big stick.",
    ],
    steps: [ { t: "visit", map: "wilds_3" }, { t: "talk", npc: "nan" } ],
    reward: rw(3, 0.7) },

  { id: "q_wicker_hearts", name: "Buttons for Eyes", giver: "nan", turnin: "nan", level: 4, after: "q_listening_straw", area: "wilds", main: true,
    offer: [
      "Something's stuffing those scarecrows with more than straw. The little ones get up and walk. Wicker children. Nobody's children.",
      "Break eight of them and bring me what's ticking in the middle. Six will do. I want to see whose handwriting is on it.",
    ],
    progress: ["Don't look them in the face, dearie. They haven't got one, and they're sensitive about it."],
    done: [
      "Hm. Grave-dirt, a milk tooth and a goblin's knot. That's ditch-work. That's his shaman.",
      "Grubnash Rust-Crown's planting sentries in my rows. A king in a ditch, with ambitions. Go and see the Warden at the Crossing.",
    ],
    steps: [ { t: "kill", mob: "the_wicker_child", n: 8 }, { t: "collect", item: "Wicker Heart", from: "the_wicker_child", n: 30, chance: 0.6 } ],
    reward: rw(4, 1.0, gear("offhand", 1)) },

  { id: "q_crown_of_nails", name: "A Crown of Nails", giver: "brina", turnin: "tobin", level: 5, after: "q_wicker_hearts", area: "wilds", main: true,
    offer: [
      "The witch sent you. Good. I've been holding this crossing against a monarchy with a pan lid and a bad temper.",
      "Grubnash holds court by the old gibbet. Crown of nails, voice like a bucket. Kill him and the rest go back to being a nuisance instead of a nation.",
      "Then tell Old Tobin the west road's open. He's been asking. He pretends he hasn't.",
    ],
    progress: ["He's not hard to find. Follow the banging. He has himself announced."],
    done: [
      "Rust-Crown's dead? Hah. I fought his grandfather. Same crown. Fewer nails.",
      "West road's open, then. That leaves east. East's the forest, and the forest's been walking closer. I'll show you where to start.",
    ],
    steps: [ { t: "boss", mob: "rust_crown_chief" } ],
    reward: rw(5, 1.2, gear("head", 1), 1) },

  { id: "q_road_gives_up", name: "Where the Road Gives Up", giver: "tobin", turnin: "kestrel", level: 6, after: "q_crown_of_nails", area: "forest", main: true,
    offer: [
      "There's a knight camped in Briarheart Thicket. Kestrel. Dusk Lancer. Lot of title for a woman living in a hedge.",
      "The wolves at the Eaves have the mange, and they've got it on purpose. Thin them out on your way through. Ten.",
      "Then find her camp. Past Hangman's Walk. If you reach the big tree full of widows, you've overshot.",
    ],
    progress: ["Ten wolves, then the Thicket. Stay on the path. If the path isn't there, stay where it was."],
    done: [
      "Tobin's sending me recruits now. He must think well of you. Or poorly of me.",
      "You're in time. The Hollow Barrow's been knocking, and kobolds have started leaving it presents.",
    ],
    steps: [ { t: "kill", mob: "briar_wolf", n: 10 }, { t: "visit", map: "forest_3" }, { t: "talk", npc: "kestrel" } ],
    reward: rw(6, 1.0, gear("body", 1)) },

  { id: "q_barrow_tokens", name: "Presents for the Prior", giver: "kestrel", turnin: "kestrel", level: 7, after: "q_road_gives_up", area: "forest", main: true,
    offer: [
      "The bluecrest kobolds on the Walk are carrying clay tokens to the Barrow door. Stamped with a prior's seal. Kobolds can't read. Somebody's paying them in a currency they don't understand.",
      "Take six tokens off them. I want to know what the dead are buying.",
    ],
    progress: ["Bluecrests, with the spears. They'll be heading for the Barrow. Head them off."],
    done: [
      "Every one of these says the same thing. OPEN. Just that. Six times over.",
      "Right. Dain the mason's at the Barrow door, bricking and swearing. It's time someone went down and asked the Prior what he wants.",
    ],
    steps: [ { t: "collect", item: "Barrow-Clay Token", from: "bluecrest_spear", n: 30, chance: 0.6 } ],
    reward: rw(7, 0.9, "potions") },

  { id: "q_hollow_barrow", name: "The Hollow Barrow", giver: "kestrel", turnin: "kestrel", level: 8, after: "q_barrow_tokens", area: "forest", main: true,
    offer: [
      "Nobody goes into the Barrow alone. I mean that as fact, not advice; the door wants five or it sulks.",
      "Find four others. There's always a few loitering by Dain, shouting about wanting a healer.",
      "Go to the bottom. Put Prior Aldous back in the ground. Take his seal, so he's nothing to sign with.",
    ],
    progress: ["Talk to Dain at the door. Bring four friends. Failing that, four people."],
    done: [
      "You've his seal. And all your limbs. I'd not have bet on both.",
      "Look at the back of it. That's not the cathedral's mark. That's older. Brother Cael knew the Prior, back when the Prior was better company. Take it to him.",
    ],
    steps: [ { t: "talk", npc: "dain" }, { t: "dungeon", id: "barrow" } ],
    reward: rw(8, 1.2, gear("weapon", 2), 1) },

  { id: "q_poor_hours", name: "The Dead Keep Poor Hours", giver: "kestrel", turnin: "cael", level: 9, after: "q_hollow_barrow", area: "graveyard", main: true,
    offer: [
      "Carry the seal to Brother Cael on Chapel Row. He'll be on a bench, fortifying himself.",
      "And go by way of Lychgate Lane. If the Barrow's awake, the graveyard won't be far behind. Put ten of the bone-cleavers down, so he's something to be grateful for.",
    ],
    progress: ["The Lychgate's off Chapel Row. You can't miss it. It's the gate everyone crosses the street to avoid."],
    done: [
      "Oh. Oh dear. That's Aldous's seal. I buried him with that. I used the good shovel.",
      "This mark on the back is a seal-warden's. There were seven of them, once, and seven doors. Oh, I do wish you hadn't shown me this before lunch.",
    ],
    steps: [ { t: "kill", mob: "bone_cleaver", n: 10 }, { t: "deliver", npc: "cael", item: "The Prior's Seal" } ],
    reward: rw(9, 1.0, gear("ring", 1)) },

  { id: "q_safety_in_numbers", name: "Safety in Numbers, Allegedly", giver: "cael", turnin: "pell", level: 10, after: "q_poor_hours", area: "hollow", main: true,
    offer: [
      "This is beyond a friar. It's beyond most things. You'll want company for what's coming, the kind with a charter.",
      "Registrar Pell keeps the Charterhouse, just along the Row. When you've a little more standing, go and have him explain guilds. He does so love to explain.",
      "A banner won't keep the dead off you. But it's a comfort to have people who'll notice you've gone.",
    ],
    progress: ["Pell wants to see standing. Tenth rank, he calls it. Go and get some more of the world on your boots."],
    done: [
      "Tenth rank. Adequate. I've registered worse; I've buried their paperwork.",
      "When you've the gold, you may found a company of your own. Until then, do join someone else's and learn from their mistakes. They'll make plenty. I keep a list.",
    ],
    steps: [ { t: "level", n: 10 }, { t: "talk", npc: "pell" } ],
    reward: rw(10, 0.7, gear("amulet", 1)) },

  { id: "q_what_town_sits_on", name: "What the Town Sits On", giver: "gorm", turnin: "hale", level: 11, after: "q_safety_in_numbers", area: "sewers", main: true,
    offer: [
      "Oi. You. The one who keeps solving things. The grate in the square's been rattling and I've run out of ways not to notice.",
      "Hale of the River Patrol is down there. Take him my regards and get rid of whatever's oozing about under the market. Black, flat, smells of regret. Ten of them.",
      "If anybody asks, I ordered an investigation. That's you. You're the investigation.",
    ],
    progress: ["Down the grate. Mind the ladder. Mind what's on the ladder."],
    done: [
      "Gorm sent you. Course he did. He drew the long straw eleven years ago and he's not let go of it since.",
      "Tar's the least of it. The water's been running the wrong way since the Barrow opened. Toward the cathedral. Water shouldn't have preferences.",
    ],
    steps: [ { t: "visit", map: "sewers_1" }, { t: "kill", mob: "rustblood_raider", n: 10 }, { t: "talk", npc: "hale" } ],
    reward: rw(11, 1.0, gear("body", 1)) },

  { id: "q_one_thousand_nights", name: "One Thousand and Seven Nights", giver: "agatha", turnin: "maeve", level: 12, after: "q_what_town_sits_on", area: "graveyard", main: true,
    offer: [
      "Brother Cael has told me about the seal, child. He told me twice and then had to lie down.",
      "Dame Maeve keeps the vigil in the Necropolis. If the dead are being called, she'll know who's calling. She hears everything. It's why she doesn't sleep.",
      "The sickle-reavers have the paths. Clear ten of them and she may even thank you. Don't wait for it.",
    ],
    progress: ["Through the Lychgate, past Pauper's Field. Follow the moonlight. There's a great deal of it, lately."],
    done: [
      "You walked on the paths. Thank you. You'd be surprised how few do.",
      "They're not being called. They're being let out. There is a difference, and it is worse.",
    ],
    steps: [ { t: "visit", map: "grave_3" }, { t: "kill", mob: "sickle_reaver", n: 10 }, { t: "talk", npc: "maeve" } ],
    reward: rw(12, 1.0, gear("head", 2)) },

  { id: "q_drowned_cistern", name: "The Drowned Cistern", giver: "hale", turnin: "hale", level: 13, after: "q_one_thousand_nights", area: "sewers", main: true,
    offer: [
      "I followed the water. It all runs to the old cistern past the Outfall, and then it goes up the well. Up.",
      "There's a regent sat at the bottom. Halloway. They drowned the whole cistern on him two hundred years back and he's been holding court to the eels ever since.",
      "Nell works the sluice. Take four with you. See what the Regent's sitting on.",
    ],
    progress: ["Nell's at the Great Outfall. Five to a boat. Don't eat anything she offers you."],
    done: [
      "He was sat on a seal. Course he was. Big stone lid, cracked straight across.",
      "That's two, then. The Prior's and the Regent's. I'm a river patrolman. I'd like it noted that this is not a river.",
    ],
    steps: [ { t: "talk", npc: "nell" }, { t: "dungeon", id: "cistern" } ],
    reward: rw(13, 1.2, gear("offhand", 2), 1) },

  { id: "q_charnel_stair", name: "Further Than It Used To", giver: "maeve", turnin: "cassius", level: 14, after: "q_drowned_cistern", area: "catacombs", main: true,
    offer: [
      "Two broken seals, and both of them leaking toward my cathedral. Then the third is beneath it.",
      "Take the Charnel Stair. At the bottom is the Skull-Lined Gallery, and in it a knight of the Silver Censer who has been exorcising it one yard at a time.",
      "The crypt-cleavers will contest the Gallery. Put down twelve. Cassius will be glad of the yardage.",
    ],
    progress: ["The stair is behind me. It has more steps going down than coming up. I have counted."],
    done: [
      "Twelve! That's the alcove secured. I'm counting the alcove.",
      "A third seal? Then it's in the Ossuary. Saint Ivo's. It's been shut from the inside for a year, and something in there has kept up the services.",
    ],
    steps: [ { t: "visit", map: "cata_2" }, { t: "kill", mob: "crypt_cleaver_skeleton", n: 12 }, { t: "talk", npc: "cassius" } ],
    reward: rw(14, 1.0, "potions") },

  { id: "q_widow_knight", name: "Lady Isaure Is Not Receiving", giver: "maeve", turnin: "maeve", level: 15, after: "q_charnel_stair", area: "graveyard", main: true,
    offer: [
      "The Ossuary door answers to the key of my order. My commander wears it. My commander is on Mausoleum Row, dead, mounted, and in a poor humour.",
      "Lady Isaure. The Widow Knight. She taught me the sword. I have tried eleven times to take the key from her and I am, as you see, still asking for help.",
      "Be quick about it. She would want it quick. She'd also want it to be someone better than you, but she will have to make do.",
    ],
    progress: ["Mausoleum Row, past the Necropolis. She patrols. She has never once been late."],
    done: [
      "Then the vigil is mine alone. One thousand and nine nights, and the first without her on the Row.",
      "Here is the key. Brother Anselm keeps the Ossuary door. Go. I have a tomb to close, and I would rather do it unobserved.",
    ],
    steps: [ { t: "boss", mob: "widow_knight" } ],
    reward: rw(15, 1.2, gear("weapon", 2)) },

  { id: "q_saint_ivo", name: "A Mistranslation", giver: "cassius", turnin: "thessaly", level: 17, after: "q_widow_knight", area: "catacombs", main: true,
    offer: [
      "You have Isaure's key. Then there's nothing left to stand behind but the door.",
      "Brother Anselm will let five through. At the end is Saint Ivo, kneeling. Whatever he was guarding, he's grown round it like a tree round a railing.",
      "When it's done, take what you find to Scholar Thessaly in the Hollow. She's been wanting to be proved right, poor woman.",
    ],
    progress: ["Anselm, on Reliquary Walk. Five through the door. Breathe the smoke first."],
    done: [
      "Cracked. Like the others. And he was kneeling ON it? Then he wasn't praying. He was holding it shut.",
      "I told them he was a locksmith. Seven seals, seven wardens. A prior, a regent, a saint. That's three broken that we've seen. My sources say six. I need to know what's at the bottom of the caves, and I need you to be the one who looks.",
    ],
    steps: [ { t: "talk", npc: "anselm" }, { t: "dungeon", id: "ossuary" }, { t: "talk", npc: "thessaly" } ],
    reward: rw(17, 1.2, gear("amulet", 2), 1) },

  { id: "q_stone_stops", name: "Where the Stone Stops Being Stone", giver: "thessaly", turnin: "halvard", level: 18, after: "q_saint_ivo", area: "caves", main: true,
    offer: [
      "Under the Dark Forest there's a cavern system. Depth's Edge. The Knights of the Last Lantern went down to map it and have been writing me shorter and shorter letters.",
      "The fourth seal was said to be stone that wept milk. There are creatures in the Dripstone Gallery with veins of the stuff. They've been eating it. Bring Sir Halvard eight shards from inside them.",
      "The way down is in Blackroot Deep. Or through the Bone Orchard, if you've no sense of self-preservation, which, reviewing your record...",
    ],
    progress: ["Dripstone Gallery, past the Root Cellar. If something calls for help, it doesn't need any."],
    done: [
      "Seal-stone. In their knuckles. So the fourth seal didn't break. It was eaten.",
      "That accounts for the lake, then. Sit by the lantern. I'll tell you about the lake, and then you'll wish I hadn't, and then you'll go anyway.",
    ],
    steps: [ { t: "visit", map: "caves_2" }, { t: "collect", item: "Seal-Stone Shard", from: "de_milkvein_knuckler", n: 40, chance: 0.6 }, { t: "talk", npc: "halvard" } ],
    reward: rw(18, 1.0, gear("ring", 2)) },

  { id: "q_brine_testament", name: "Old Soundless", giver: "halvard", turnin: "thessaly", level: 20, after: "q_stone_stops", area: "caves", main: true,
    offer: [
      "There's a lake below with no light and no echo. The fifth seal was sunk in it. Something lives where the seal was and has written what it learned in salt, on itself.",
      "My men call it Old Soundless. The Brine Testament. It took nineteen of us without a noise. I'd like one made.",
      "Kill it. Don't speak near the water. Then go up and tell your scholar what was written on it. She'll want to know. She'll be sorry.",
    ],
    progress: ["Blind Lake, beyond the Gallery. Don't talk at the shore. It's learning how."],
    done: [
      "It had the fifth seal's words on its hide? Read them to me. No. Slower.",
      "Five. Prior, Regent, Saint, the eaten one, the drowned one. The sixth was at Thornwall; Castellan Elsabet as good as told me. That's six. Go and see her. I'm going to sit very still with a drink.",
    ],
    steps: [ { t: "boss", mob: "de_the_brine_testament" }, { t: "talk", npc: "thessaly" } ],
    reward: rw(20, 1.2, gear("body", 2), 1) },

  { id: "q_veilscar", name: "Something Was Dragged Through Here", giver: "elsabet", turnin: "bastian", level: 21, after: "q_brine_testament", area: "march", main: true,
    offer: [
      "So the scholar has reached Thornwall at last. Yes. The sixth seal lay under my chapel. It broke the night my garrison stood back up.",
      "I held nine days. I will not apologise for the tenth.",
      "Captain Vane besieges the castle. The road to him runs through the Veilscar March. Sergeant Bastian holds the Reach; the wraiths hold everything else. Reduce them by twelve and tell him the Ivory Mantle is coming home.",
    ],
    progress: ["Through the graveyard, out by the Scar Gate, and east. Keep to the causeway. The heath is not a floor."],
    done: [
      "Twelve wraiths. That's the most good news I've had since the dry sock.",
      "Elsabet's coming back? Flame preserve us, she'll want the camp tidy. Thornwall's east along the road. Everything that fled it is between here and there.",
    ],
    steps: [ { t: "visit", map: "march_3" }, { t: "kill", mob: "murk_wraith", n: 12 }, { t: "talk", npc: "bastian" } ],
    reward: rw(21, 1.0, "potions") },

  { id: "q_thornwall_road", name: "They're Still Manning the Walls", giver: "bastian", turnin: "vane", level: 24, after: "q_veilscar", area: "castle", main: true,
    offer: [
      "Captain Vane's camp is at the end of the Thornwall Road. You'll know it by the smell of despair and boiled oats.",
      "The garrison sends pike patrols out to the siege lines. Dead men. Good drill. Break fourteen of them on your way in; it's the polite thing, arriving at a siege.",
    ],
    progress: ["East. Keep going east until somebody shoots at you. That's the castle."],
    done: [
      "Fourteen pikes down and you walked in upright. I've promoted men for less. I've no one left to promote.",
      "The Castellan sent you, and the scholar. Then it's the chapel they want. So do I. There's a gatehouse in the way.",
    ],
    steps: [ { t: "visit", map: "castle_1" }, { t: "kill", mob: "ck_rust_pike_revenant", n: 14 }, { t: "talk", npc: "vane" } ],
    reward: rw(24, 1.0, gear("offhand", 2)) },

  { id: "q_gatehouse", name: "Thornwall Gatehouse", giver: "vane", turnin: "vane", level: 25, after: "q_thornwall_road", area: "castle", main: true,
    offer: [
      "Marshal Corvane holds the Gatehouse. He was the best officer I had. He still is, which is the difficulty.",
      "Dame Rosette has the sally-port key. Five of you, through the Murder Passage. It's called that for sound architectural reasons.",
      "Raise the portcullis and I can bring sixty men into the bailey. Fail and I'll have five more names to read out. I'm running short of evenings.",
    ],
    progress: ["Rosette's by the sally port. Five. Quietly. He still drills them at dawn."],
    done: [
      "The portcullis is up. Two hundred and twelve days, and it took five of you an afternoon. I'm choosing to be glad rather than insulted.",
      "The bailey's ours by nightfall. Then the chapel. There's a dead knight under it who's been guarding a door for longer than this castle's stood. Go and introduce yourself.",
    ],
    steps: [ { t: "talk", npc: "rosette" }, { t: "dungeon", id: "gatehouse" } ],
    reward: rw(25, 1.2, gear("head", 3), 1) },

  { id: "q_seventh_door", name: "The Weight on the Lid", giver: "vane", turnin: "wymond", level: 27, after: "q_gatehouse", area: "castle", main: true,
    offer: [
      "Under the chapel there's an undercroft, and the congregation never left. Husks, with candles for heads. Fifteen fewer would let my sappers breathe.",
      "At the far end stands a knight called Wymond. He's dead. He's on our side. I've stopped finding that sentence strange.",
      "He says the sixth seal broke upstairs and the seventh is behind him. Ask him what he needs. Then, Flame help us, get it for him.",
    ],
    progress: ["Down through the Outer Bailey, under the chapel. Mind the moths. They know the hymns."],
    done: [
      "You're alive. I'd forgotten the look of it.",
      "Velscour was bound by seven seals. Six broke. The seventh is through that door, and the thing they built to stand on it has started to shift its weight. I need twenty. I'd settle for twenty who listen.",
    ],
    steps: [ { t: "visit", map: "castle_4" }, { t: "kill", mob: "ck_votive_husk", n: 15 }, { t: "talk", npc: "wymond" } ],
    reward: rw(27, 1.0, gear("ring", 3)) },

  { id: "q_ossuarch", name: "Six Broke", giver: "wymond", turnin: "thessaly", level: 28, after: "q_seventh_door", area: "castle", main: true,
    offer: [
      "Ossuarch. The Bone Colossus. An older kingdom made him out of its own garrison and stood him on the last seal, so that nothing could lift it.",
      "Something below has been teaching him to walk. If he steps off, there are no seals left, only a hole and what's at the bottom of it.",
      "Gather twenty. Go through the Processional, through the hall where the six are hung up broken like trophies, and stop him. Not kill. He's been dead for an age. Stop.",
    ],
    progress: ["Twenty. Not nineteen and a bard. I'll open the Vault when you've the numbers."],
    done: [
      "He's down? Then he's fallen ACROSS the seal. Oh, that's good. That's better than standing. A corpse doesn't get ideas about walking.",
      "Velscour was bound by seven seals. Six broke. One holds, under a dead giant, in a castle we barely own, guarded by a knight who can't leave.",
      "I looked at the broken six, in your rubbings. They weren't broken from below. Every one was opened from our side. By someone with a key. Do sit down. I think we should talk about who owns keys.",
    ],
    steps: [ { t: "dungeon", id: "vault" }, { t: "talk", npc: "thessaly" } ],
    reward: rw(28, 1.2, gear("weapon", 3), 2) },

  // ═════════════════════════════ THE FORSAKEN WILDS ═════════════════════════════
  { id: "q_w_bells", name: "Left in a Neat Row", giver: "rowena", turnin: "rowena", level: 2, after: null, area: "wilds",
    offer: [
      "Forty sheep, forty bells. The sneaks have been wearing them. On their belts, like medals.",
      "Get me six back. I can't hang them on anything, but I'd know they weren't jingling on a goblin.",
    ],
    progress: ["Listen for them. A goblin that jingles is a goblin that's eaten well."],
    done: [
      "That's Bess's bell. And Dot's. And the one I called Mutton, as a warning to the others.",
      "Thank you. I'll hang them on the fence. It's a very well-behaved flock, now.",
    ],
    steps: [ { t: "collect", item: "Sheep Bell", from: "scrapknife_sneak", n: 30, chance: 0.6 } ],
    reward: rw(2, 0.8) },
  { id: "q_w_crows", name: "They Sit Like They're Owed", giver: "rowena", turnin: "rowena", level: 2, after: "q_w_bells", area: "wilds",
    offer: [
      "The crows have got bold. They don't wait for things to die any more. They stand about and suggest it.",
      "Six of them. And a few of those gravehounds while you're at it, they've been digging up my good grass.",
    ],
    progress: ["Still crows on my fence. I can feel them judging the wool."],
    done: [
      "Quiet. Listen to that. No, there's nothing. That's the point.",
      "Here. It was going to be for shearing season. There isn't going to be a shearing season.",
    ],
    steps: [ { t: "kill", mob: "grave_crow", n: 6 }, { t: "kill", mob: "bellback_fanatic", n: 6 } ],
    reward: rw(2, 1.0, gear("body", 0)) },
  { id: "q_w_honey", name: "Not From Bees", giver: "nan", turnin: "nan", level: 3, after: null, area: "wilds",
    offer: [
      "There's goblins in the Acres boiling stolen hives in a cauldron. Several hives. The whole pot's honey now, and so are they.",
      "Cauldron-honey's the best thing for a cough and the worst thing for a carpet. Bring me plenty, dearie.",
    ],
    progress: ["The yellow ones. If it's green, that's a different jar and a different ailment."],
    done: [
      "Lovely. Still buzzing a bit. That's how you know it's fresh.",
      "A spoonful for you. Go on. It only tastes of goblin at the end.",
    ],
    steps: [ { t: "collect", item: "Cauldron Honey", from: "cauldron_carrier", n: 25, chance: 0.6 } ],
    reward: rw(3, 0.8, "potions") },
  { id: "q_w_crone", name: "Professional Courtesy", giver: "nan", turnin: "nan", level: 4, after: "q_w_honey", area: "wilds",
    offer: [
      "There's another witch in my rows. All brambles and bad posture. She didn't call, she didn't leave a card, and she's been hexing my turnips.",
      "I'd see to it myself, but there's etiquette. You're not a witch. You can be as rude as you like.",
    ],
    progress: ["She comes and goes. Wait about by the scarecrows. She can't resist a ring of them."],
    done: [
      "Gone? Good. Sixty years I've had this patch. You don't just turn up with a staff.",
      "Take her hat's worth in coin. I'm keeping the hat.",
    ],
    steps: [ { t: "kill", mob: "bramble_crone", n: 1 } ],
    reward: rw(4, 1.1, gear("amulet", 1)) },
  { id: "q_w_mill", name: "Nobody Tries the Door", giver: "brina", turnin: "brina", level: 4, after: null, area: "wilds",
    offer: [
      "The Burnt Mill's got lights in it at night. Little ones, going up and down the stairs. Goblin grubbers with lanterns, looking for something in the ash.",
      "Climb up and put out eight of those lanterns. Whatever they're digging for, I'd rather it stayed dug.",
    ],
    progress: ["The mill's up off Scarecrow Rows. It's the one that's burnt. There's only the one."],
    done: [
      "Dark up there tonight. First time since spring.",
      "What were they after? Millstones? No. Something under them. Ah, well. That's a problem for someone with a longer contract.",
    ],
    steps: [ { t: "visit", map: "wilds_mill" }, { t: "kill", mob: "lantern_grubber", n: 8 } ],
    reward: rw(4, 1.0, gear("offhand", 1)) },
  { id: "q_w_panlids", name: "You'll Never Enjoy a Kitchen Again", giver: "brina", turnin: "brina", level: 5, after: "q_w_mill", area: "wilds",
    offer: [
      "The duelists. With the pan lids. They bang them before every charge. All night. I haven't slept since the equinox.",
      "Eight lids. I don't care about the goblins attached. Well. I do. But principally the lids.",
    ],
    progress: ["CLANG. Hear that? That's the sound of me losing my mind in instalments."],
    done: [
      "Eight. Oh, that's beautiful. I'm going to bury them. Deep.",
      "Here, for your trouble. And if you ever take up the cymbals, we are no longer friends.",
    ],
    steps: [ { t: "collect", item: "Dented Pan Lid", from: "panlid_duelist", n: 40, chance: 0.6 } ],
    reward: rw(5, 0.9, gear("head", 1)) },
  { id: "q_w_orchard", name: "Is Any of That Food", giver: "greener", turnin: "gobble", level: 6, after: null, area: "wilds",
    offer: [
      "There's an orchard up the hill past the gallows. Nobody goes. The apples never got picked so they just kept getting more apple.",
      "The path's a secret. It's up. You have to look up. Nobody ever looks up.",
      "Bring five for Gobble. He ate my bed.",
    ],
    progress: ["Up! From the Crossing! The goblins with the whips have got all the good ones."],
    done: [
      "Apple. Apple apple apple apple. That's five. I can count when it's food.",
      "You can have this. I found it in my mouth. It's a coin. I don't like coins. They don't go down.",
    ],
    steps: [ { t: "visit", map: "wilds_5" }, { t: "collect", item: "Unpicked Apple", from: "vine_whip_raider", n: 25, chance: 0.6 } ],
    reward: rw(6, 1.0, gear("ring", 1)) },

  // ═════════════════════════════ THE DARK FOREST ═════════════════════════════
  { id: "q_f_pelts", name: "A Face In It", giver: "bjorn", turnin: "bjorn", level: 5, after: null, area: "forest",
    offer: [
      "I need eight wolf pelts without the mange. One wolf in three, maybe, is still mostly wolf.",
      "Skin them at the Eaves. If the pelt looks back at you, leave it.",
    ],
    progress: ["No mange, no faces, no extra seams. I've standards. They're low, but they're there."],
    done: [
      "These'll do. That one's got a bit of a stare, but I'll put it on the inside.",
      "Coin, as agreed. And a tonic. You've a scratch that's thinking about becoming a personality.",
    ],
    steps: [ { t: "collect", item: "Unmangy Pelt", from: "briar_wolf", n: 40, chance: 0.6 } ],
    reward: rw(5, 0.9, "potions") },
  { id: "q_f_archers", name: "The Path Was Here This Morning", giver: "kestrel", turnin: "kestrel", level: 7, after: null, area: "forest",
    offer: [
      "There are archers on Hangman's Walk. Greywood men. Deserters, I thought, until I saw one take an arrow and not mind.",
      "Ten of them. And they shoot from where the path used to be, so go careful.",
    ],
    progress: ["Greywood archers. They don't miss often. Be one of the times."],
    done: [
      "Ten. The Walk's safe as far as the third gibbet, then. After that it's merely unpleasant.",
      "Take this. A knight ought to give gifts. It's that or advice, and my advice has been 'leave' for six years.",
    ],
    steps: [ { t: "kill", mob: "greywood_archer", n: 10 } ],
    reward: rw(7, 1.0, gear("offhand", 1)) },
  { id: "q_f_gallowsman", name: "Hanged By Appointment", giver: "kestrel", turnin: "kestrel", level: 8, after: "q_f_archers", area: "forest",
    offer: [
      "The Walk had a hangman once. Blindfolded himself, so he'd not know the faces. He's still at it. He's stopped waiting for sentences.",
      "He walks the gibbets some nights. Find him. Give him the afternoon off.",
    ],
    progress: ["He's blind, not deaf. Don't jingle."],
    done: [
      "He's down? Good. I found a noose on my saddle last week, measured. I didn't care for the implication.",
      "This was in the camp chest. Nobody alive has a claim on it.",
    ],
    steps: [ { t: "kill", mob: "blind_gallowsman", n: 1 } ],
    reward: rw(8, 1.1, gear("body", 2)) },
  { id: "q_f_mortar", name: "Billing By the Day", giver: "dain", turnin: "dain", level: 8, after: null, area: "forest",
    offer: [
      "I'm out of rubble. A mason, out of rubble, in a forest. The sling-runners have been lobbing stones at me all week and then coming to fetch them back.",
      "Get me six of their sling-stones. Good round river rock. I'll have it in the Barrow door by supper.",
    ],
    progress: ["Yellow kobolds, slings. They've a pouch each. I only want the stones. Keep the pouch, they smell."],
    done: [
      "Lovely. See the grain on that? That'll hold a dead prior for, oh, days.",
      "Here's your cut. I've put it on the Hollow's bill. They'll never pay it, but it's the principle.",
    ],
    steps: [ { t: "collect", item: "Kobold Sling-Stone", from: "yellow_sling_runner", n: 30, chance: 0.6 } ],
    reward: rw(8, 0.8) },
  { id: "q_f_prior_owes", name: "The Prior Owes Me For Bricks", giver: "dain", turnin: "dain", level: 9, after: "q_hollow_barrow", area: "forest",
    offer: [
      "He's up again. Aldous. I heard him clearing his throat through eleven feet of masonry.",
      "Go back down and settle him. And if he's got any grave-goods left, I'm owed for nine courses of brick and my nerves.",
    ],
    progress: ["Five for the Barrow, same as ever. He doesn't get easier. He does get crosser."],
    done: [
      "Quiet again. I give it a week. I'll start mixing.",
      "Your share. I've taken out for the bricks. And the nerves.",
    ],
    steps: [ { t: "boss", mob: "barrow_prior" } ],
    reward: rw(9, 1.2, gear("ring", 2)) },
  { id: "q_f_silk", name: "The Spiders Left a Note", giver: "bjorn", turnin: "bjorn", level: 10, after: "q_f_pelts", area: "forest",
    offer: [
      "Widow silk. From the stilt-legs up the big oak. Stronger than rope, lighter than debt. I can sell it to Ottilie for a fortune.",
      "Six skeins. You'll have to climb. I'd go myself, but I'm a coward. It's kept me alive this long and I shan't change now.",
    ],
    progress: ["Up the Widow Oak. All the way up. If it's sticky, you're on the right branch."],
    done: [
      "Look at that. You could hang a bishop from one thread of it. They did, once, I heard.",
      "Fair's fair. I'm a coward, not a cheat.",
    ],
    steps: [ { t: "visit", map: "forest_4" }, { t: "collect", item: "Widow Silk", from: "stiltleg_spider", n: 30, chance: 0.6 } ],
    reward: rw(10, 1.0, gear("amulet", 1)) },
  { id: "q_f_huntsman", name: "Hob Carrow's Last Season", giver: "kestrel", turnin: "kestrel", level: 11, after: "q_f_gallowsman", area: "forest",
    offer: [
      "I came to this forest to hunt one beast. It turns out the beast was a man named Hob Carrow, who hunted here forty years and then didn't stop when he died.",
      "He's in Blackroot Deep, grown through with thorn. He takes trophies. He took my squire.",
      "I would do it myself. I have tried. He knows my horse.",
    ],
    progress: ["Blackroot Deep, east of here. He hunts by sound. So for pity's sake, don't sneak. He likes it when they sneak."],
    done: [
      "Six years. I ought to feel something grander than tired.",
      "My squire's badge. Thank you. I'll ride at dawn, if this forest ever has one. Until then, I find I've no other plans.",
    ],
    steps: [ { t: "boss", mob: "thorn_huntsman" } ],
    reward: rw(11, 1.2, gear("weapon", 2), 1) },
  { id: "q_f_charcoal", name: "Not Burning Charcoal Any More", giver: "bjorn", turnin: "bjorn", level: 12, after: "q_f_silk", area: "forest",
    offer: [
      "The charcoal-burners used to buy salt off me. Decent sorts. Sooty. Then one season they stopped coming, and the smoke off their glade went the wrong colour.",
      "There's a way up from the Deep, if you look overhead. Go and see. If they're acolytes of something now, well. Ten fewer acolytes.",
    ],
    progress: ["Look up, in Blackroot Deep. Follow the smoke. If it follows you back, hurry."],
    done: [
      "All of them? Old Pask too? Ah. He owed me for a sack of salt. I'll write it off.",
      "Here. And I'm sorry I asked. I'd rather have gone on wondering.",
    ],
    steps: [ { t: "visit", map: "forest_6" }, { t: "kill", mob: "cinder_acolyte", n: 10 } ],
    reward: rw(12, 1.0, gear("head", 2)) },

  // ═════════════════════════════ CATHEDRAL GRAVEYARD ═════════════════════════════
  { id: "q_g_tallow", name: "Four Hundred Behind", giver: "quill", turnin: "quill", level: 8, after: null, area: "graveyard",
    offer: [
      "I'm out of tallow, and the gravediggers have been pocketing my stock. Dead men, stealing candles. What do they even want the light for?",
      "Eight lumps. Check their aprons.",
    ],
    progress: ["The ones with shovels. They're very diligent. Nobody asked them to be."],
    done: [
      "That's a week of wicks. Every flame's a soul at rest. Well. A soul being asked nicely.",
      "For your trouble. And a candle. Don't light it indoors; it's one of the strong ones.",
    ],
    steps: [ { t: "collect", item: "Grave Tallow", from: "gravedigger", n: 40, chance: 0.6 } ],
    reward: rw(8, 0.8, "potions") },
  { id: "q_g_moths", name: "After the Wick", giver: "quill", turnin: "quill", level: 9, after: "q_g_tallow", area: "graveyard",
    offer: [
      "The moths. Big as a hand, pale as a lie. They don't go for the flame, they pinch it out. Every candle they kill, something stands up.",
      "Eight of them. And mind the dust off the wings. It makes you remember funerals you weren't at.",
    ],
    progress: ["Another one's gone out. Hurry, would you? I'm trying to run a cemetery."],
    done: [
      "The Lane's holding its light. Count the dark patches. Go on. Fewer.",
      "Here. It's not much. Sexton's wages. I'm paid in gratitude and second-hand boots.",
    ],
    steps: [ { t: "kill", mob: "grave_moth", n: 8 } ],
    reward: rw(9, 1.0, gear("ring", 1)) },
  { id: "q_g_edwin", name: "Edwin Owes the Butcher", giver: "marrow", turnin: "marrow", level: 10, after: null, area: "graveyard",
    offer: [
      "My fourth husband's up and about in Pauper's Field. Grinning. He never grinned in life. He hadn't the teeth.",
      "I don't want him killed, particular. He's had that. I want his hat. It was my first husband's hat and Edwin had no right.",
    ],
    progress: ["One of the grinning ones has it. You'll know the hat. It's got a feather and no shame."],
    done: [
      "That's it. That's Harold's hat. Oh, it still smells of him. Pipe smoke and disappointment.",
      "Bless you. Here's a copper a wail's worth, saved up. I've done a lot of wailing.",
    ],
    steps: [ { t: "collect", item: "Edwin's Hat", from: "grinning_ghoul", n: 25, chance: 0.6 } ],
    reward: rw(10, 1.0, gear("head", 1)) },
  { id: "q_g_paupers", name: "No Stones, No Names", giver: "marrow", turnin: "marrow", level: 10, after: "q_g_edwin", area: "graveyard",
    offer: [
      "The paupers have formed up. Spears in front, bows behind. They never had a thing in life and somebody's gone and given them a regiment.",
      "Ten of each. Lay them down. I'll do the mourning. Nobody else will; that's what pauper means.",
    ],
    progress: ["Spears and bows. I'll start wailing when you're halfway. It's all in the build."],
    done: [
      "Twenty. Oh, woe. Alas. And so forth. That was a good one, did you hear the catch in it?",
      "They'll have names in my prayers, if nowhere else. I make them up. This one's Gerald.",
    ],
    steps: [ { t: "kill", mob: "bone_spearman", n: 10 }, { t: "kill", mob: "skeleton_bowman", n: 10 } ],
    reward: rw(10, 1.1, gear("body", 1)) },
  { id: "q_g_lanterns", name: "Nobody's Carrying Them", giver: "maeve", turnin: "maeve", level: 12, after: null, area: "graveyard",
    offer: [
      "The lantern-wraiths drift the Necropolis leading mourners off the paths. There are no mourners. They have begun leading each other.",
      "Bring me six of their lanterns. I will hang them where they are of use.",
    ],
    progress: ["Do not follow the light. Take it. There is a difference of posture."],
    done: [
      "Six. I shall set them on the Stair. Whoever comes up will at least see what they are climbing toward.",
      "The order's thanks. I am the order. So: my thanks.",
    ],
    steps: [ { t: "collect", item: "Wandering Lantern", from: "pale_lanternwraith", n: 30, chance: 0.6 } ],
    reward: rw(12, 0.9, gear("offhand", 1)) },
  { id: "q_g_bell", name: "No Rope on That Bell", giver: "maeve", turnin: "maeve", level: 13, after: "q_g_lanterns", area: "graveyard",
    offer: [
      "The cathedral bell tolls with no rope and no ringer. Each toll, the Row stirs. I climbed to see. The bell has grown legs.",
      "It is at the top of the tower. Silence it. I do not say this lightly; it was a wedding gift to the cathedral.",
    ],
    progress: ["The tower is above the Necropolis. Climb. It will know you are coming. It is, after all, a bell."],
    done: [
      "Silence. I had forgotten its texture.",
      "Take this. It was to be an offering. I think the Flame would rather it were used.",
    ],
    steps: [ { t: "visit", map: "grave_4" }, { t: "kill", mob: "bell_golem", n: 1 } ],
    reward: rw(13, 1.2, gear("amulet", 2)) },
  { id: "q_g_who_rings", name: "We Haven't Got a Bell-Ringer", giver: "cael", turnin: "agatha", level: 13, after: null, area: "graveyard",
    offer: [
      "I went up the bell tower to see who was ringing. I got as far as the fourth landing. There were ghouls. Dressed as crows. Pulling at nothing.",
      "I came down very quickly. I left the sacramental wine up there. Twelve of them, friend, and don't mention the wine to Mother Agatha.",
    ],
    progress: ["Fourth landing. Possibly fifth. I wasn't counting, I was praying. Loudly."],
    done: [
      "Brother Cael sent you up the tower. And he left what up there? I see.",
      "Tessariel's light on you, child. And on Brother Cael. He'll need it, presently.",
    ],
    steps: [ { t: "kill", mob: "bellcrow_ghoul", n: 12 }, { t: "talk", npc: "agatha" } ],
    reward: rw(13, 1.0, "potions") },

  // ═════════════════════════════ THE FETID SEWERS ═════════════════════════════
  { id: "q_s_rats", name: "Patrol Log: Wet", giver: "hale", turnin: "hale", level: 10, after: null, area: "sewers",
    offer: [
      "The grate rats have doubled since the thaw. They're the size of terriers and they've started working in shifts.",
      "Twelve. It won't make a dent. But I can write 'twelve' in the log and feel I've earned the lantern oil.",
    ],
    progress: ["Rats. Big ones. No, bigger. No. Keep going. That one."],
    done: [
      "Twelve. I'll put it in the log. 'Rats: fewer. Smell: same.'",
      "Patrol pay. It's damp. Everything's damp.",
    ],
    steps: [ { t: "kill", mob: "ck_grate_rat", n: 12 } ],
    reward: rw(10, 0.8) },
  { id: "q_s_tallow", name: "Rendering Something Big", giver: "wren", turnin: "wren", level: 12, after: null, area: "sewers",
    offer: [
      "There's tallow coming up the drains, dear. Good tallow. Somebody down there is rendering something, and the leavings have got up and gone for a wander.",
      "Eight lumps off the husks. It makes a lovely salve. No, I shan't tell you what it was. I don't know, and that's how I like it.",
    ],
    progress: ["Tallow Channel, past the market drains. The waxy fellows. Don't get any in a cut."],
    done: [
      "Oh, that's rich stuff. Smell that. No, don't.",
      "Here's a few reds for your trouble. Fresh batch. New recipe. Entirely unrelated.",
    ],
    steps: [ { t: "collect", item: "Rendered Tallow", from: "tallow_husk", n: 40, chance: 0.6 } ],
    reward: rw(12, 0.9, "potions") },
  { id: "q_s_door", name: "Everything Under Four Inches Knows", giver: "bartholomew", turnin: "bartholomew", level: 13, after: null, area: "sewers",
    offer: [
      "There's a door in this wall. The smugglers behind it believe it's hidden. They also believe in trapping rats, which is where our interests meet.",
      "Ten of the red-veiled ones. I'd do it myself, but I'm eight inches long and it would take all week.",
    ],
    progress: ["The door's along the channel, about the middle. Push the brick with the tooth marks. They're mine."],
    done: [
      "Ten. Marvellous. You've a real gift for this. It's not a nice gift, but it's real.",
      "There's a ring in the third crate. I'd wear it myself, but the last ring I put on gave me opinions.",
    ],
    steps: [ { t: "visit", map: "sewers_h" }, { t: "kill", mob: "red_veil_cutthroat", n: 10 } ],
    reward: rw(13, 1.1, gear("ring", 2)) },
  { id: "q_s_leeches", name: "Somebody's Been At My Leeches", giver: "nell", turnin: "wren", level: 14, after: null, area: "sewers",
    offer: [
      "Old Mother Wren's after leeches. The white ones off the Outfall, fine as china. She says they draw a fever lovely.",
      "Six. Pick them up by the middle. Both ends bite. Take them straight up to her; they don't keep, and they don't like me.",
    ],
    progress: ["White ones. Porcelain. If it's red, it's already had someone."],
    done: [
      "Oh, look at them! Little darlings. Nell's a good girl. Smells like a harbour, but a good girl.",
      "Now, hold still. No, I'm joking, dear. These are for paying customers.",
    ],
    steps: [ { t: "collect", item: "Porcelain Leech", from: "porcelain_leech", n: 30, chance: 0.6 }, { t: "talk", npc: "wren" } ],
    reward: rw(14, 0.9, "potions") },
  { id: "q_s_regent", name: "Don't Make Him Get Up", giver: "nell", turnin: "nell", level: 14, after: "q_drowned_cistern", area: "sewers",
    offer: [
      "He's sat back down. Halloway. I saw the chair through the sluice with him in it, wet as ever, holding court.",
      "My nets come up empty when he's sitting. Take four down and tip him out of it again.",
    ],
    progress: ["Sluice is open. Five in the boat. Somebody bail."],
    done: [
      "Chair's empty. Eels are back. I never thought I'd be glad of eels.",
      "Here. Fished it up last spring. I've no use for it; it keeps trying to command me.",
    ],
    steps: [ { t: "boss", mob: "phx_dh_11_07_the_drowned_regent_in_his_chair" } ],
    reward: rw(14, 1.2, gear("head", 2)) },
  { id: "q_s_cagebelly", name: "Three Hundred Bartholomews", giver: "bartholomew", turnin: "bartholomew", level: 16, after: "q_s_door", area: "sewers",
    offer: [
      "Cagebelly. At the Junction. A great stitched brute with a cage where his stomach ought to be, and my family in it.",
      "They call him the Rat-King. He isn't a king, he's a larder with legs. Open him.",
      "If any of them are still in there, tell them Bartholomew sent you. They'll all think you mean them.",
    ],
    progress: ["Rat-King's Junction. Past the Outfall. You'll hear the squeaking. Try not to think about it."],
    done: [
      "The cage is open? How many came out? ...Ah. Well. Forty is forty.",
      "I'm told one gives a reward. I've gnawed this off something valuable. It's the thought, and also the gold.",
    ],
    steps: [ { t: "boss", mob: "cagebelly" } ],
    reward: rw(16, 1.2, gear("weapon", 2), 1) },
  { id: "q_s_drop", name: "The Water Has Preferences", giver: "hale", turnin: "hale", level: 18, after: "q_s_rats", area: "sewers",
    offer: [
      "Under the Junction there's a shaft. The Long Drop. Everything the sewers can't stomach goes down it. Lately some of it's been climbing back.",
      "Worms, mostly. Mouths with a bit of worm round them. Ten, and tell me how far down it goes. I'd like to stop wondering.",
    ],
    progress: ["Down the shaft at the Junction. Take a rope. Take two. One's for coming back."],
    done: [
      "No bottom? At all? Hm. I'll put 'deep' in the log.",
      "Hazard pay. First I've ever issued. I had to look up the form.",
    ],
    steps: [ { t: "visit", map: "sewers_5" }, { t: "kill", mob: "gullet_worm", n: 10 } ],
    reward: rw(18, 1.0, gear("body", 2)) },

  // ═════════════════════════════ SKULL-LINED CATACOMBS ═════════════════════════════
  { id: "q_c_stair", name: "More Steps Going Down", giver: "maeve", turnin: "cassius", level: 12, after: null, area: "catacombs",
    offer: [
      "The Charnel Stair was hung with penitents, pinned up by their own request. They have reconsidered.",
      "Twelve of the pinned ones. Then tell Sir Cassius below that the stair is passable. He has not had a relief in a year and has started to believe he is the last man alive.",
    ],
    progress: ["Down. They hang from the walls. Then, abruptly, they do not."],
    done: [
      "The stair's clear? There's still an up? Flame be praised. I'd begun to think I'd imagined daylight.",
      "Take this, from the order's stores. The order being me and a sack.",
    ],
    steps: [ { t: "kill", mob: "pinned_skeleton", n: 12 }, { t: "talk", npc: "cassius" } ],
    reward: rw(12, 1.0, gear("offhand", 1)) },
  { id: "q_c_skulls", name: "Count How Many Are Looking", giver: "cassius", turnin: "cassius", level: 14, after: null, area: "catacombs",
    offer: [
      "The wall-skulls have been turning to face inward. Watching the Gallery. The cleavers carry the turned ones about like lanterns, so the walls can see round corners.",
      "Bring me ten. I'll put them back in the wall facing out, with a nail if I must.",
    ],
    progress: ["Ten skulls. Carry them face-down. I shouldn't have to explain why."],
    done: [
      "Ten. Back in the wall with you. Out. Face OUT. There.",
      "That's another eight yards of Gallery I can turn my back on. Bless you for it.",
    ],
    steps: [ { t: "collect", item: "Watching Skull", from: "crypt_cleaver_skeleton", n: 50, chance: 0.6 } ],
    reward: rw(14, 0.9, "potions") },
  { id: "q_c_incense", name: "Faith's Holding About Level", giver: "cassius", turnin: "cassius", level: 16, after: "q_c_skulls", area: "catacombs",
    offer: [
      "I'm nearly out of incense. The dead friars on Reliquary Walk are still swinging censers. Theirs burn something else. But the ash is ash, and blessed twice is blessed.",
      "Six measures. Don't breathe theirs. Breathe mine. It's a matter of loyalty and also lungs.",
    ],
    progress: ["The censer-friars, on the Walk. If you start hearing plainsong, hold your breath."],
    done: [
      "It'll serve. It smells of old grief, but so do I.",
      "For you. A knight-exorcist's blessing, and something more practical.",
    ],
    steps: [ { t: "collect", item: "Censer Ash", from: "censer_friar", n: 30, chance: 0.6 } ],
    reward: rw(16, 1.0, gear("amulet", 2)) },
  { id: "q_c_rubbings", name: "Especially Rude Writing", giver: "thessaly", turnin: "thessaly", level: 16, after: null, area: "catacombs",
    offer: [
      "The reliquary-bearers on the Walk are hauling caskets with inscriptions I've only seen in footnotes. I want rubbings. Five.",
      "You'll have to stop the bearer first. They don't hold still for scholarship. Nothing ever does.",
    ],
    progress: ["Charcoal and paper. Press firmly. On the casket, I mean, not the bearer."],
    done: [
      "Oh. Oh, these are wonderful. 'Here lies the left hand of' and then it's been scratched out. From inside.",
      "Take this. A grant. From my own purse, the university having declined to believe me.",
    ],
    steps: [ { t: "collect", item: "Reliquary Rubbing", from: "reliquary_bearer", n: 25, chance: 0.6 } ],
    reward: rw(16, 1.0, gear("ring", 2)) },
  { id: "q_c_kneeling", name: "Do Not Help Him Up", giver: "anselm", turnin: "anselm", level: 17, after: "q_saint_ivo", area: "catacombs",
    offer: [
      "He is kneeling again. I heard the reliquary settle. I had hoped. One does.",
      "Go in once more, five together, and lay him flat. I'll say the office. I've had the practice.",
    ],
    progress: ["Five through the door. It's warm again. I do wish it wouldn't."],
    done: [
      "Quiet. The door's cooling. Thank you. Truly.",
      "This was on the altar before all this. He'd have wanted it used. He was practical. Locksmiths are.",
    ],
    steps: [ { t: "boss", mob: "phx_dh_11_01_the_reliquary_that_kneels" } ],
    reward: rw(17, 1.2, gear("body", 2)) },
  { id: "q_c_no_relation", name: "No Relation (By Marriage)", giver: "marrow", turnin: "marrow", level: 18, after: "q_g_paupers", area: "catacombs",
    offer: [
      "Mother Marrow, in the Bone Orchard. My second husband's mother. Dreadful woman. Grew things. Still does, only now it's ribs.",
      "She never thought I was good enough for her Wilfred. Go down and tell her Wilfred's dead and I've had two more since.",
      "Then kill her. In that order. I want her to have a moment with it.",
    ],
    progress: ["The Bone Orchard, deep in the catacombs. She'll be the one in the middle, criticising."],
    done: [
      "Did she say anything? About me? ...'Who?' She said 'who'? Thirty years, and 'who'.",
      "Well. Here's what I owe you. I'm going to go and have a wail. A real one. On my own time.",
    ],
    steps: [ { t: "boss", mob: "mother_marrow" } ],
    reward: rw(18, 1.2, gear("weapon", 2), 1) },
  { id: "q_c_ambulatory", name: "The Catacombs Have Got Bigger", giver: "thessaly", turnin: "thessaly", level: 20, after: "q_c_rubbings", area: "catacombs",
    offer: [
      "My map has a corridor on it that wasn't there last week. Above the Bone Orchard. Sealed, on the old plans. An ambulatory for processions that nobody was meant to see.",
      "There'll be liches. There always are, behind a seal. Kill four plague-bearers and tell me what the walls say.",
    ],
    progress: ["Look up, in the Orchard. The old plans say 'do not'. They don't say do not what. Nobody finishes a sentence in this field."],
    done: [
      "The walls say 'SIX'? Just the numeral? Carved fresh?",
      "Somebody down there is keeping count. I'd assumed that was only me.",
    ],
    steps: [ { t: "visit", map: "cata_5" }, { t: "kill", mob: "plague_lich", n: 4 } ],
    reward: rw(20, 1.1, gear("head", 2)) },

  // ═════════════════════════════ DEPTH'S EDGE CAVERNS ═════════════════════════════
  { id: "q_d_clay", name: "Moves a Bit", giver: "marta", turnin: "marta", level: 14, after: null, area: "caves",
    offer: [
      "Best clay I ever threw comes off those hand-things in the Cellar. The ones that reach up out of the wet. They're mostly clay. It's the rest that's the trouble.",
      "Eight good lumps. If it grips back, slap it. It's only clay. Tell yourself that.",
    ],
    progress: ["The well-hands. They come up where it's damp. It's all damp. So: everywhere."],
    done: [
      "Feel that. Like butter. Butter that remembers being a hand.",
      "There's your pay, and a pot. I made that one. You can tell because it's a bit rubbish.",
    ],
    steps: [ { t: "collect", item: "Remembering Clay", from: "de_wellhand", n: 40, chance: 0.6 } ],
    reward: rw(14, 0.8, "potions") },
  { id: "q_d_miners", name: "Told Not To Dig", giver: "halvard", turnin: "halvard", level: 14, after: null, area: "caves",
    offer: [
      "Goblins have followed us down with pickaxes. They're digging toward the warm places. Every hole they open, something comes up through it.",
      "Eight diggers. I've nothing against goblins. I've a great deal against holes.",
    ],
    progress: ["Listen for the picks. Then for when the picks stop. That second one's the bad sound."],
    done: [
      "Eight. Then the Cellar holds another week.",
      "Lantern oil's all I've got to give that's worth having. And this.",
    ],
    steps: [ { t: "kill", mob: "pickaxe_digger", n: 8 } ],
    reward: rw(14, 1.0, gear("offhand", 1)) },
  { id: "q_d_rescue", name: "It Learned the Word", giver: "halvard", turnin: "halvard", level: 16, after: "q_d_miners", area: "caves",
    offer: [
      "Something in the Gallery calls for help in Corporal Brandt's voice. Brandt's been dead since autumn. It has his voice and it's wearing most of his coat.",
      "Three of my men went to it. Go to it. Don't help.",
    ],
    progress: ["It'll call. It only knows the one word, but it says it very well."],
    done: [
      "It's quiet in the Gallery? Good. Brandt was a quiet man. He'd have hated being used so.",
      "His kit. He'd no family. He'd want it carried by somebody who came back.",
    ],
    steps: [ { t: "kill", mob: "de_false_rescue", n: 1 } ],
    reward: rw(16, 1.2, gear("body", 2)) },
  { id: "q_d_chimney", name: "Daylight, Such As It Is", giver: "halvard", turnin: "halvard", level: 18, after: null, area: "caves",
    offer: [
      "There's a chimney off the Gallery that goes all the way up to the March. It's our only way out that doesn't go past the Barrow roots.",
      "Things have folded themselves into it like bats. Eight of the folded ones, and climb until you see sky. Then come and tell me the sky's still there.",
    ],
    progress: ["Up the Chimney. They hang folded. Don't mistake them for the rock. The rock doesn't breathe."],
    done: [
      "Sky. Grey? Raining? Flame, I miss rain that's only rain.",
      "Take it. You've given eleven men a back door. That's worth more than I've got.",
    ],
    steps: [ { t: "visit", map: "caves_3" }, { t: "kill", mob: "de_funeral_fold", n: 8 } ],
    reward: rw(18, 1.0, gear("head", 2)) },
  { id: "q_d_oil", name: "Something Hums Back", giver: "marta", turnin: "marta", level: 18, after: "q_d_clay", area: "caves",
    offer: [
      "Halvard's lanterns are running dry, and I'm not sitting in the dark with that grey jug. The lantern-things up the Chimney carry their own oil. In the middle. Don't ask.",
      "Six flasks. It burns blue and smells of hair, but it burns.",
    ],
    progress: ["Up the Chimney. The ones with the light in their belly. Mind where you grab."],
    done: [
      "Six. That's a month of not being in the dark. I'd kiss you if you didn't smell of cave.",
      "Payment. And I've glazed you a little charm. It's meant to be a fish.",
    ],
    steps: [ { t: "collect", item: "Lantern-Belly Oil", from: "de_navel_lantern", n: 30, chance: 0.6 } ],
    reward: rw(18, 0.9, gear("amulet", 2)) },
  { id: "q_d_pearls", name: "What the Dredgers Bring Up", giver: "marta", turnin: "marta", level: 20, after: "q_d_oil", area: "caves",
    offer: [
      "The dredgers at Blind Lake drag the bottom all day and swallow what they find. Now and then it's a pearl. Black. Makes a glaze like the night sky, if you remember that.",
      "Five. Go quiet at the water. Halvard says it listens. I say everything down here does, but the lake takes notes.",
    ],
    progress: ["Blind Lake. Dredgers. Don't talk. Don't hum. I know. It's hard."],
    done: [
      "Oh, look at the depth on that. You could fall into that glaze.",
      "Here. And if you see the surface, tell it Marta's got a batch in and she'll be up after.",
    ],
    steps: [ { t: "collect", item: "Black Lake-Pearl", from: "de_grief_dredger", n: 25, chance: 0.6 } ],
    reward: rw(20, 1.0, gear("ring", 2)) },
  { id: "q_d_listening", name: "The Quiet Is Occupied", giver: "halvard", turnin: "halvard", level: 22, after: "q_brine_testament", area: "caves",
    offer: [
      "With Old Soundless dead I sent a man to the lake shore. He came back writing, not speaking. He wrote: there is a room under the lake where everything we said down here has been kept.",
      "Find it. There are strangers in it, he wrote, muffled ones. Ten. Then leave, and say nothing in there you'd mind hearing again.",
    ],
    progress: ["There's a way down at the far shore of the lake. He drew me a map. Then he ate it."],
    done: [
      "You heard Brandt? And me? Giving orders I gave in autumn?",
      "Then we've never been alone down here. Not for one word of it. Take this. I'm going to sit by the lantern and not talk for a while.",
    ],
    steps: [ { t: "visit", map: "caves_5" }, { t: "kill", mob: "de_muffled_stranger", n: 10 } ],
    reward: rw(22, 1.2, gear("weapon", 3), 1) },

  // ═════════════════════════════ THE VEILSCAR MARCH ═════════════════════════════
  { id: "q_m_socks", name: "The Saddest Thing in the March", giver: "ottilie", turnin: "ottilie", level: 16, after: null, area: "march",
    offer: [
      "The fen crossbowmen looted my wagon on the Causeway. Forty bolts of velvet they left in the mud. What they took was the stockings. Every pair.",
      "Eight pairs back. Dry-ish. Bastian's feet are a matter of public health.",
    ],
    progress: ["Crossbowmen, on the Causeway. Check their feet. They'll be the only warm thing on them."],
    done: [
      "Eight pairs. Barely worn. Well. Worn by the dead, but they don't sweat.",
      "Coin. And don't tell the sergeant where they've been. Let him have this.",
    ],
    steps: [ { t: "collect", item: "Dry-ish Stockings", from: "fen_crossbowman", n: 40, chance: 0.6 } ],
    reward: rw(16, 0.8, "potions") },
  { id: "q_m_toads", name: "Squelch", giver: "bastian", turnin: "bastian", level: 16, after: null, area: "march",
    offer: [
      "Toads. With spears. I've fought orcs, I've fought the dead, I once fought a bishop. I am not losing the Causeway to toads.",
      "Twelve. They're pickets for something bigger. They keep croaking a name.",
    ],
    progress: ["Twelve spear-toads. If it croaks 'Gullock' at you, that's one of them."],
    done: [
      "Twelve. The Causeway's ours as far as the dead willow. I'll have a flag put on it. We haven't a flag. I'll have a sock put on it.",
      "Your pay. It's rusty. It still spends.",
    ],
    steps: [ { t: "kill", mob: "bogspear_toad", n: 12 } ],
    reward: rw(16, 1.0, gear("offhand", 2)) },
  { id: "q_m_sailors", name: "Forty Miles From Any Sea", giver: "bastian", turnin: "bastian", level: 18, after: "q_m_toads", area: "march",
    offer: [
      "The drowned on the Heath carry boarding-spears and wear ship's colours. There's no ship. There's no sea. There was, I'm told, about nine hundred years back.",
      "Twelve spearmen. I don't need to understand it. I need it to stop walking into my camp asking for the tide.",
    ],
    progress: ["The Drowned Heath. Spearmen. They'll ask you which way the harbour is. Don't point at the camp."],
    done: [
      "Twelve. And the mist's thinner for it. They bring it with them, I think. Like luggage.",
      "Take this. Came up out of the peat with a face next to it. I kept the thing and reburied the face.",
    ],
    steps: [ { t: "kill", mob: "drowned_spearman", n: 12 } ],
    reward: rw(18, 1.0, gear("body", 2)) },
  { id: "q_m_witch", name: "Paid In Advance", giver: "ottilie", turnin: "ottilie", level: 18, after: "q_m_socks", area: "march",
    offer: [
      "A woman bought a shroud off me. Paid in old coin, walked into the Heath with a lantern. Next morning the shroud was back on my stall, folded. With somebody's measurements pinned to it. Mine.",
      "She's a bog-witch and she's shopping. Find her lantern on the Heath and put it out.",
    ],
    progress: ["She walks the Heath with a lantern. Not every night. Just the foggy ones. So, every night."],
    done: [
      "Out? You're sure? Lantern and all? Oh, thank the Flame. I've been sleeping in my stays.",
      "Take your pick off the tray. And the shroud, if you want it. No? No. I'll burn it.",
    ],
    steps: [ { t: "kill", mob: "bog_lantern_witch", n: 1 } ],
    reward: rw(18, 1.2, gear("amulet", 2)) },
  { id: "q_m_gullock", name: "A Toad the Size of a Cart", giver: "bastian", turnin: "bastian", level: 20, after: "q_m_sailors", area: "march",
    offer: [
      "Gullock. Toad-Shaman of the Scar. He squats in the Reach calling the mist up out of the peat and the drowned up with it.",
      "I reported him. Headquarters asked if I'd been drinking. I'd like to send them his staff, with a note.",
    ],
    progress: ["He's out in the Reach, where the peat's cut deepest. Big. Warty. Has a staff. You can't confuse him with the other toads; he's the one the other toads bow to."],
    done: [
      "That's his staff? It's got a bell on. Of course it has. Everything out here has a bell on.",
      "I'll write the note. 'Dear sirs, please find enclosed one toad's staff. I have not been drinking. I am about to.'",
    ],
    steps: [ { t: "boss", mob: "bog_toad_shaman" } ],
    reward: rw(20, 1.2, gear("weapon", 2), 1) },
  { id: "q_m_beacon", name: "Which Way's Bad", giver: "bastian", turnin: "bastian", level: 22, after: null, area: "march",
    offer: [
      "The Leaning Beacon's meant to burn when Thornwall needs help. It's been burning for a year. Nobody's tending it. Crow-witches roost up there and feed it things.",
      "Climb it. Eight witches. Don't put the fire out. If it ever stops, I want it to be because the castle's stopped needing help.",
    ],
    progress: ["Up the Beacon, off the Reach. It leans. Lean with it. Don't argue with the building."],
    done: [
      "Eight. Fire still lit? Good. Burning honest wood again, I hope.",
      "This was the beacon-keeper's. He doesn't need it. He was the first thing they fed the fire.",
    ],
    steps: [ { t: "visit", map: "march_4" }, { t: "kill", mob: "ashen_crow_witch", n: 8 } ],
    reward: rw(22, 1.1, gear("head", 2)) },
  { id: "q_m_velvet", name: "Velvet in a Swamp", giver: "ottilie", turnin: "ottilie", level: 24, after: "q_m_witch", area: "march",
    offer: [
      "My velvet. The marauders on the Thornwall Road dug it out of the mud and they're wearing it. Rust-blade brigands in forty bolts of Tessarine purple. I could weep. I have.",
      "Six bolts. I don't care what state. I'll wash it. I'll wash it in the bog if I have to.",
    ],
    progress: ["The ones with rusty swords and suspiciously lovely cloaks."],
    done: [
      "Oh, my darlings. Look what they did to the nap. Never mind. Never mind. Mother's here.",
      "You've saved a business. It's a business in a swamp selling to corpses, but it's mine.",
    ],
    steps: [ { t: "collect", item: "Bolt of Velvet", from: "rustblade_marauder", n: 30, chance: 0.6 } ],
    reward: rw(24, 1.0, gear("body", 3)) },

  // ═════════════════════════════ THORNWALL ═════════════════════════════
  { id: "q_k_pikes", name: "Eleven Pikes Without a Chit", giver: "ilse", turnin: "ilse", level: 24, after: null, area: "castle",
    offer: [
      "Eleven pikes left my stores without a signature. I have traced them. The dead garrison raided my tent, took eleven pikes, and left the form blank.",
      "Retrieve them. Eleven. Not ten. I shall be counting, and so will my ledger, which is less forgiving than I am.",
    ],
    progress: ["Eleven. From the pike revenants. They're mine. The pikes. I've no claim on the revenants."],
    done: [
      "Nine, ten, eleven. Sign here to say you returned them. And here to say I received them. And here.",
      "Payment, less nothing. I'm in a good mood. Tell no one.",
    ],
    steps: [ { t: "collect", item: "Unsigned-For Pike", from: "ck_rust_pike_revenant", n: 55, chance: 0.6 } ],
    reward: rw(24, 0.9, "potions") },
  { id: "q_k_hounds", name: "Morale Is Complicated", giver: "vane", turnin: "vane", level: 24, after: null, area: "castle",
    offer: [
      "The castle looses its hounds on the camp every night. On chains. Somebody up there still holds the other end and reels them in at dawn.",
      "Twelve hounds. Cut the chains if you can. I want whoever's on the wall to pull up twelve empty collars and think about it.",
    ],
    progress: ["Chain hounds, around the siege lines. Mind the chain. It's the chain that gets you."],
    done: [
      "Twelve collars went up the wall empty this morning. There was a pause. A long one. I enjoyed it enormously.",
      "From the war chest. It's a small chest. It's more of a war purse.",
    ],
    steps: [ { t: "kill", mob: "ck_chain_hound", n: 12 } ],
    reward: rw(24, 1.0, gear("offhand", 2)) },
  { id: "q_k_ogre", name: "Nobody Has Two", giver: "ilse", turnin: "ilse", level: 25, after: "q_k_pikes", area: "castle",
    offer: [
      "There are ogres shackled in the bailey. The garrison used them to haul the siege stores. My siege stores. They are sitting on forty crates stencilled with my initials.",
      "Five ogres. Do not damage the crates. Damage to the ogres is authorised.",
    ],
    progress: ["Outer Bailey. Ogres. Shackled, which sounds helpful and isn't."],
    done: [
      "Five. And the crates intact? ...Mostly. I'll allow 'mostly'. Write 'mostly' there.",
      "Take this from crate nine. It's surplus. I have never said that word before in my life.",
    ],
    steps: [ { t: "kill", mob: "ck_shackled_ogre", n: 5 } ],
    reward: rw(25, 1.0, gear("body", 2)) },
  { id: "q_k_marshal", name: "He Still Drills Them at Dawn", giver: "rosette", turnin: "rosette", level: 25, after: "q_gatehouse", area: "castle",
    offer: [
      "I heard muster this morning. From inside. Corvane's back on his feet, both halves of him, calling the roll.",
      "He called my name. I nearly answered. Go in and dismiss him again. Properly. Tell him the watch is relieved.",
    ],
    progress: ["Five through the sally port. You know the way. Unfortunately, by now, so do they."],
    done: [
      "No muster? Then I'll sleep past dawn, for once. I won't. But I could.",
      "This was in the armory, under his name. He'd have issued it to you himself. He liked soldiers who came back.",
    ],
    steps: [ { t: "boss", mob: "phx_dh_12_06_the_split_plate_marshal" } ],
    reward: rw(25, 1.2, gear("weapon", 3)) },
  { id: "q_k_spoon", name: "The War Stops Until It's Found", giver: "ilse", turnin: "ilse", level: 26, after: "q_k_ogre", area: "castle",
    offer: [
      "The spoon is gone.",
      "An imp with a ring of keys was seen leaving my tent, heading for the Curtain Wall. It is one spoon. It is the only spoon. Sixty men have been eating soup with their hands for two days and I can feel the campaign coming apart.",
    ],
    progress: ["The keyring imps, up on the wall. One of them has it. Search all of them. Thoroughly."],
    done: [
      "That's it. That's the spoon. Don't look at me like that; you've not seen an army try to share a ladle.",
      "I'm writing you into the ledger. Under 'Assets'. It's the highest honour I'm empowered to bestow.",
    ],
    steps: [ { t: "collect", item: "The Spoon", from: "ck_keyring_imp", n: 25, chance: 0.6 } ],
    reward: rw(26, 1.1, gear("ring", 3)) },
  { id: "q_k_slit", name: "Second Arrow-Slit From the Left", giver: "rosette", turnin: "rosette", level: 27, after: null, area: "castle",
    offer: [
      "My mother kept the gate before me. She's on the Curtain Wall now, at her old slit, loosing at anything in our colours. She never missed in life. She's got worse, a little. I take comfort in that.",
      "Ten of the wraiths at the slits. I can't tell you which is her. I'd rather not know which it was.",
    ],
    progress: ["Up the Curtain Wall. Keep moving between the slits. They lead their shots."],
    done: [
      "Ten. Second from the left's dark? ...Thank you. No. Don't say anything else.",
      "It was hers. The gate-knight's token. I've had it in my boot for a year, not feeling I'd earned the giving of it.",
    ],
    steps: [ { t: "visit", map: "castle_3" }, { t: "kill", mob: "ck_arrow_slit_wraith", n: 10 } ],
    reward: rw(27, 1.1, gear("amulet", 3)) },
  { id: "q_k_forge", name: "I Checked Their Inventory", giver: "ilse", turnin: "ilse", level: 29, after: "q_k_spoon", area: "castle",
    offer: [
      "The dead garrison is being re-armed. New mail, fresh edges. Somebody is running Thornwall's forge, below the bailey, and has not filed for the coal.",
      "There's a way down that isn't on the plans. Find it. Bring me eight ingots off the smiths as evidence. I intend to lodge a complaint, and then I intend to win the war with it.",
    ],
    progress: ["A hidden stair in the Outer Bailey, they say. Follow the warm flagstones."],
    done: [
      "Thornwall steel, eight bars, still warm. And stamped this month. They're keeping better books than the captain.",
      "Homunculus the Proud will weep when he sees these. Here's your share. I've rounded up. Don't make a thing of it.",
    ],
    steps: [ { t: "visit", map: "castle_6" }, { t: "collect", item: "Thornwall Ingot", from: "ck_soot_smith", n: 40, chance: 0.6 } ],
    reward: rw(29, 1.0, gear("head", 3)) },
  { id: "q_k_seneschal", name: "He Kept the Keys", giver: "elsabet", turnin: "elsabet", level: 30, after: "q_ossuarch", area: "castle",
    offer: [
      "Scholar Thessaly tells me the seals were opened from our side, with keys. My seneschal held every key in Thornwall. Maudrin. Thirty years at my right hand, and never once looked me in the eye. I took it for deference.",
      "He is in the Great Keep, at my table, in a veil, doing my accounts. Bring me his ring of keys.",
      "And count them. If there are seven on it, we may yet sleep. If there are six, then somebody else is holding the last one.",
    ],
    progress: ["The Great Keep, beyond the bailey. He will be at the high table. He will not rise for you. Make him."],
    done: [
      "One. Two. Three. Four. Five. Six.",
      "Six keys, and an empty loop where the seventh hung. Worn bright. He gave it to someone, and recently.",
      "Then it is not over. It has barely been introduced. Keep your blade sharp and your guild close. Thornwall thanks you. So do I, which is rarer.",
    ],
    steps: [ { t: "boss", mob: "ck_the_veiled_seneschal" }, { t: "collect", item: "Seneschal's Key-Ring", from: "ck_the_veiled_seneschal", n: 25, chance: 1 } ],
    reward: rw(30, 1.2, gear("amulet", 3), 2) },

  // ═════════════════════════════ TOWN ERRANDS ═════════════════════════════
  { id: "q_e_jelly", name: "Mainly Newt", giver: "wren", turnin: "wren", level: 1, after: null, area: "hollow",
    offer: [
      "I'm short of crowmask nettle-jelly, dear. It's what makes the red ones red. Well. It's what makes them stay down.",
      "Six scoops, off the Hollow Road. Use the jar. Not your hands. You'll want those later.",
    ],
    progress: ["The prickly green ones. Scoop from the middle. The edges are bitter."],
    done: [
      "Lovely and thick. Hear that? It's still grumbling. That's quality.",
      "A few bottles for your trouble. Drink them before they drink you. I'm joking. Mostly.",
    ],
    steps: [ { t: "collect", item: "Bramble Jelly", from: "crowmask_sneak", n: 30, chance: 0.6 } ],
    reward: rw(1, 0.8, "potions") },
  { id: "q_e_wobbly", name: "The Wobbly Bit", giver: "gobble", turnin: "gobble", level: 1, after: null, area: "hollow",
    offer: [
      "Hungry. The green droplets on the road. They've got a wobbly bit. I want the wobbly bit.",
      "Three. Greener says I'm only allowed three. Greener isn't looking.",
    ],
    progress: ["Wobbly bit? Have you got the wobbly bit? That's a sword. I can't eat that. I checked."],
    done: [
      "Mmmf. Mmmmf. Good. Minty. Why is it minty?",
      "Here. I was keeping it in my cheek. It's shiny. You like shiny. Tall people like shiny.",
    ],
    steps: [ { t: "collect", item: "Wobbly Bit", from: "scorpion_spearer", n: 25, chance: 0.6 } ],
    reward: rw(1, 0.6) },
  { id: "q_e_billhook", name: "A Long Excuse", giver: "garrick", turnin: "rowena", level: 2, after: null, area: "hollow",
    offer: [
      "Rowena the shepherd ordered a bill-hook. Sharpened. For the sheep, she said, and then gave a laugh I didn't care for.",
      "Take it out to her at Fallow Acres. Don't run with it. I've sold a lot of things to people who ran with them.",
    ],
    progress: ["Fallow Acres, west road. She's the one shouting at a field."],
    done: [
      "Oh, that's a lovely edge. That'll do for the next thing that comes at my fence with hands.",
      "Tell Garrick I'll pay him at shearing. He'll know what that means. It means no.",
    ],
    steps: [ { t: "deliver", npc: "rowena", item: "Sharpened Bill-Hook" } ],
    reward: rw(2, 0.6) },
  { id: "q_e_pothelms", name: "Lovely Condition (The Greave, I Mean)", giver: "stevie", turnin: "stevie", level: 3, after: null, area: "hollow",
    offer: [
      "The clubbers out in the Rows wear cooking pots on their heads. Good iron, those pots. Wasted on a goblin; wasted on soup, frankly.",
      "Five pot-helms. I'll beat the dents out and sell them as 'rustic sallets'. That's not a con, that's a category.",
    ],
    progress: ["Pot-helms. Off goblins. Empty them first."],
    done: [
      "Look at that. Two rivets and a chin-strap and that's a helmet. Smells of stew, but so does half the militia.",
      "Your cut. And I'll knock a bit off your next purchase. Not literally. Well.",
    ],
    steps: [ { t: "collect", item: "Dented Pot-Helm", from: "pothelm_clubber", n: 25, chance: 0.6 } ],
    reward: rw(3, 0.8, gear("head", 0)) },
  { id: "q_e_crate", name: "I've Decided It's a Clock", giver: "ulf", turnin: "lily", level: 3, after: null, area: "hollow",
    offer: [
      "This crate's for the enchanter. It ticks. It also whispers my wages, which I've not told anybody, including the taxman.",
      "I'm not carrying it another yard. You carry it. Don't open it. Don't tilt it. Don't listen to it about your wages.",
    ],
    progress: ["Lily Belle. Veil, candles, just up the lane. If it stops ticking, walk faster."],
    done: [
      "Ah. My Tuesday. I wondered where that had got to.",
      "You didn't listen to it? Good. It lies about money. For the porter's trouble, and yours.",
    ],
    steps: [ { t: "deliver", npc: "lily", item: "Ticking Crate" } ],
    reward: rw(3, 0.6) },
  { id: "q_e_notice", name: "The Second Set of Dice", giver: "gorm", turnin: "gorm", level: 4, after: null, area: "hollow",
    offer: [
      "I've a notice to serve on Fortunato regarding dice, weighted, two sets. And one on Pitmaster Hask regarding a door that bites.",
      "I'd serve them myself, but then they'd be served, and I'd have to follow up. You do it. Then it's hearsay.",
    ],
    progress: ["Fortunato's in the square. Hask is on Chapel Row. Just tell them they've been told."],
    done: [
      "They both laughed? Good. That's 'acknowledged receipt', in my book.",
      "Here. From the fines box. There's never been a fine in it. That's my own money. Don't spread it about.",
    ],
    steps: [ { t: "talk", npc: "fortunato" }, { t: "talk", npc: "hask" } ],
    reward: rw(4, 0.6) },
  { id: "q_e_stew", name: "It's a Medley", giver: "greta", turnin: "greta", level: 5, after: null, area: "hollow",
    offer: [
      "Stew's running thin. There are goats out at Gallowmere, the black ones that stand about the gibbet looking bereaved. They stew up a treat.",
      "Four shanks. Don't tell the customers. They think it's mutton. Rowena thinks it's mutton. Let her.",
    ],
    progress: ["Mourner's goats, at the Crossing. They don't run. They just look at you. Be strong."],
    done: [
      "Good shanks. Bit of sorrow in the meat, but that cooks out.",
      "Bowl's on the house. Bed's still four gold.",
    ],
    steps: [ { t: "collect", item: "Goat Shank", from: "mourner_s_goat", n: 25, chance: 0.6 } ],
    reward: rw(5, 0.8, "potions") },
  { id: "q_e_amulet", name: "Under-Explained", giver: "jamie", turnin: "thessaly", level: 6, after: null, area: "hollow",
    offer: [
      "Item two hundred and twelve: one amulet, unclaimed, knocking. Three knocks, a pause, three knocks. All night. From inside a locked drawer.",
      "Take it to Scholar Thessaly. She likes things that oughtn't to do what they do. I like a quiet vault.",
    ],
    progress: ["Thessaly, Chapel Row, behind the books. If it knocks four times, put it down and step away."],
    done: [
      "Three and three? That's not knocking. That's counting. Six, over and over. Oh, I don't like that at all. Leave it with me.",
      "The Curator's fee, and mine. You're becoming very useful. It's a dangerous thing to be, here.",
    ],
    steps: [ { t: "deliver", npc: "thessaly", item: "Knocking Amulet" } ],
    reward: rw(6, 0.7) },
  { id: "q_e_scrap", name: "Iron for the Holy Forge", giver: "homunculus", turnin: "homunculus", level: 7, after: null, area: "hollow",
    offer: [
      "Hero! The forge hungers, and the kobolds of Hangman's Walk carry spearheads of surprisingly honest iron!",
      "Bring me five. I'll melt them down and bless them. The blessing comes out green these days. That's a good sign. I've decided.",
    ],
    progress: ["Five spearheads from the bluecrests! The axe has been humming about it all week. She's keen."],
    done: [
      "Kobold iron! Crude, but sincere. Like my singing!",
      "Thy reward, friend. The voice in the axe calls you 'adequate'. From a saint, that's practically a sonnet.",
    ],
    steps: [ { t: "collect", item: "Kobold Spearhead", from: "bluecrest_spear", n: 25, chance: 0.6 } ],
    reward: rw(7, 0.8, gear("weapon", 1)) },
  { id: "q_e_tapers", name: "A Candle for Every Grave", giver: "agatha", turnin: "quill", level: 8, after: null, area: "hollow",
    offer: [
      "Quill the sexton is four hundred candles behind, child, and every dark grave is an open door.",
      "Take him these tapers. I've blessed them. Twice, the second time with feeling.",
    ],
    progress: ["Through the Lychgate. He'll be just inside, dipping wicks and muttering."],
    done: [
      "Blessed ones? From Mother Agatha? Oh, those burn green at the tip. The moths hate those.",
      "Here. From the plot fund. Nobody's buying plots. They've noticed the tenants don't stay.",
    ],
    steps: [ { t: "deliver", npc: "quill", item: "Blessed Tapers" } ],
    reward: rw(8, 0.6, "potions") },
  { id: "q_e_hat", name: "Not One of Them Has Brought Back My Hat", giver: "zebulon", turnin: "zebulon", level: 10, after: null, area: "hollow",
    offer: [
      "I left my hat in the Breach. Eleven years ago. Tall, purple, a moon on it. I'd go myself, but I went once for an afternoon and look at the beard.",
      "Step through. Kill thirty of whatever's in there today. I shan't pretend it'll turn up the hat. But it does make me feel that efforts are being made.",
    ],
    progress: ["Through the purple one. You can't miss it. Believe me, I've tried."],
    done: [
      "No hat? No. No, of course. But you looked. Thirty times, with violence.",
      "Take this. It fell out of the Breach last week. Everything does, eventually, except hats.",
    ],
    steps: [ { t: "visit", map: "breach" }, { t: "kill", area: "breach", n: 30 } ],
    reward: rw(10, 0.9, gear("offhand", 2)) },
  { id: "q_e_relic", name: "Something Old and Unpleasant", giver: "malakor", turnin: "malakor", level: 12, after: null, area: "hollow",
    offer: [
      "I am told the catacombs have reopened. This is a tragedy for the parish and a considerable opportunity for me.",
      "Bring me three relics from below. Finger-bones of the pious, that sort of thing. They needn't be authentic. They need only be old, and to have been prayed at by someone who meant it.",
    ],
    progress: ["Anything in the catacombs may be carrying one. The dead are sentimental. It is their worst quality."],
    done: [
      "Ah. Yes. This one hums. This one weeps a little. And this is a chicken bone, but it has a certain presence.",
      "Your payment. And a word of advice, gratis: when you find the seventh key, do not be the one holding it.",
    ],
    steps: [ { t: "collect", item: "Minor Relic", from: { area: "catacombs" }, n: 3, chance: 0.12 } ],
    reward: rw(12, 0.9, gear("ring", 2)) },
];
