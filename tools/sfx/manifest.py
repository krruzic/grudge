"""Every sound effect file the game ships: id -> raw CC0 sources and how to cut them (see build.py).

Ids are what src/audio/ plays (assets/sfx/<id>.<n>.ogg, one file per variant). Options:
  rate   pitch/speed factor (0.8 = deeper and slower)    split  each separate hit in a file becomes a variant
  start/dur  slice the source (seconds)                   pick   keep only these variant indices
  hp/lp  high/low-pass Hz        gain  dB after loudness matching (level: target, default -14 dBFS)
  max    variant cap (8)         maxdur  cut long tails   loop  seconds of seamless loop (beds; stereo)
Library prefixes are folders under $SFX_RAW (tools/sfx/fetch.sh); bsb/NNNN = BigSoundBank sound NNNN.
"""

IMP = "kenney_impact-sounds/Audio/"
RPG = "kenney_rpg-audio/Audio/"
IFC = "kenney_interface-sounds/Audio/"
UIA = "kenney_ui-audio/Audio/"
ANN = "kenney_voiceover-pack-fighter/Audio/"
JNG = "kenney_music-jingles/Audio/"
ORPG = "oga_80-CC0-RPG-SFX_0/"
OC1 = "oga_80-CC0-creature-SFX_0/"
OC2 = "oga_80-CC0-creature-sfx-2/"
O100 = "oga_100-CC0-SFX_0/"
O100B = "oga_sfx_100_v2/"
ART = "oga_rpg_sound_pack/RPG Sound Pack/"
WAR = "exi/Warrior Voice Pack/Warrior Pack/"
ORC = "exi/Orc Voice Pack/Orc Pack/"
FEM = "exi/RPG Voice Starter Pack/Type 3/"
ADV = "oga2/voice-clip-pack-male-adventurer-rpg/RPG Male Adventurer/"
ZOM = "oga2/zombie-skeleton-monster-voice-effects/Voice Effects Zombie-Skeleton-Monster Human Male/"
STM = "oga2/steampunk-fantasy-voices/"
WOOSH = "exi/Micro Pack - Organic Wooshes/"
BOOM = "exi/NIIIEMAND's explosion sfx/"
BFH = "exi/75-cc0-breaking-falling-hit-sfx/bfh1_"
WATER = "exi/40-cc0-water-splash-slime-sfx/"
MUD = "exi/25-CC0-mud-sfx/"
LOOPS = "exi/30-cc0-sfx-loops/"
BANG = "exi/25-CC0-bang-sfx/"
WM = "exi/100-CC0-wood-metal-SFX/"
FSA = "exi/Free Sound Assets/"
FSX = "exi/Free SFX for anything/"
MAGIC = "exi/Magic Sound Effects/"
P1 = "exi/FREE SFX PACK VOL 1/"
P2 = "exi/FREE SFX PACK VOL 2/"
WF = "exi/warfork-cc0/sounds/"
BEAST = "exi/beast_or_animal/"

ENTRIES = []


def S(id, *src, **opts):
    ENTRIES.append({"id": id, "src": list(src), **opts})


def bsb(*ids):
    return [f"bsb/{int(i):04d}.mp3" for i in ids]


def bsb_ids():
    out = set()
    for e in ENTRIES:
        for s in e["src"]:
            if s.startswith("bsb/"):
                out.add(s[4:8])
    return sorted(out)


# ── Combat foundation ──
S("swing.light", WOOSH + "Swish *.wav", WOOSH + "Classic Swish *.wav", max=8)
S("swing.heavy", ART + "battle/swing*.wav", WOOSH + "Classic Swish *.wav", rate=0.72, lp=5000, max=6)
S("swing.blade", *bsb(1795, 1796, 1797, 1798, 1799, 1800, 1801, 1802), max=8)
S("hit.flesh", IMP + "impactPunch_medium_*.ogg", max=5)
S("hit.heavy", IMP + "impactPunch_heavy_*.ogg", max=5)
S("hit.armor", IMP + "impactPlate_medium_*.ogg", max=5)
S("hit.blunt", IMP + "impactWood_heavy_*.ogg", FSX + "hit/hit-deep_*.wav", max=8)
S("hit.blade", WF + "weapons/blade_hitflsh*.ogg", RPG + "knifeSlice*.ogg", *bsb(127), max=6)
S("hit.crit", FSA + "misc/hit_critical.wav", FSA + "abstract/sching.wav", FSA + "weapons/slash*.wav")
S("hit.blocked", IMP + "impactMetal_medium_*.ogg", max=5)
S("hit.ward", IMP + "impactGlass_light_*.ogg", rate=0.8, max=5)
S("hit.structure", IMP + "impactMining_*.ogg", BFH + "rock_hit_01.ogg", max=6)
S("hit.wood", IMP + "impactPlank_medium_*.ogg", BFH + "wood_hit_*.ogg", max=8)
S("miss", WOOSH + "Whistle *.wav", max=6, gain=-3)
S("dodge", RPG + "cloth*.ogg", max=4)
S("parry", FSA + "weapons/parry.wav", IMP + "impactMetal_light_*.ogg", max=6)
S("shove", IMP + "impactSoft_heavy_*.ogg", max=5)
S("wallsplat", BFH + "rock_breaking_*.ogg", max=3)
S("guardbreak", BFH + "breaking_*.ogg", BFH + "glass_breaking_0[12].ogg", max=4)
S("body.land", IMP + "impactSoft_medium_*.ogg", BFH + "falling_0[1-4].ogg", max=8)
S("fall", WF + "players/male/fall_*.ogg", WF + "players/padpork/fall_*.ogg", max=6)
S("fall.pit", WF + "players/*/falldeath.ogg", max=4)
S("slow", MUD + "mud_0[1-8].ogg", max=6)
S("root", WM + "wood_cracking_*.ogg", max=4)
S("poison", WATER + "bubble_*.ogg", ART + "inventory/bubble*.wav", max=6)
S("bleed", RPG + "knifeSlice*.ogg", rate=1.2)
S("shield.up", FSX + "magic/magic_00[1-3].wav", gain=-4)
S("shield.break", BFH + "glass_breaking_*.ogg", max=6)
S("heal", MAGIC + "chimes.wav", FSX + "Power/PP_0[1-3].wav", max=4, gain=-4)
S("respawn", FSX + "teleport/tele_00*.wav", max=5)
S("levelup", FSX + "Power/PP_UP_0*.wav", max=5)
S("learned", RPG + "bookFlip*.ogg", max=3)
S("death.sting", O100 + "gong_0*.ogg", rate=0.8, maxdur=3.5, fout=0.8)
S("jump", FSA + "misc/jump.wav", WOOSH + "Swish [1-3].wav", rate=0.85, max=4, maxdur=0.6)
S("blink", FSX + "teleport/tele_00*.wav", rate=1.3, max=5)
S("explode.small", BOOM + "explosion-0[1-6].wav", max=6, maxdur=1.5, fout=0.4)
S("explode.big", BOOM + "explosion-1*.wav", FSX + "Explosion/explosion_big_*.wav", max=8, maxdur=2.5, fout=0.8)
S("explode.far", *bsb(1023, 1806), FSX + "Explosion/explosion_echo_*.wav", max=5, maxdur=3, fout=1)
S("rock.break", BFH + "rock_breaking_*.ogg", BFH + "rock_falling_0[1-5].ogg", max=8)
S("rock.rumble", *bsb(1022), FSA + "misc/earthquake.wav", split=True, gap=0.4, max=6, maxdur=3, fout=0.6)
S("wood.break", BFH + "wood_breaking_*.ogg", WM + "wood_breaking_*.ogg", max=6)
S("whoosh.big", *bsb(572, 573), split=True, gap=0.25, max=6, maxdur=1.6)
S("magic.bolt", FSX + "magic/magic_00*.wav", max=5)
S("magic.spell", ORPG + "spell_0*.ogg", ART + "battle/spell.wav", ART + "battle/magic1.wav", MAGIC + "spell.wav")
S("magic.dark", MAGIC + "echo*.wav", P1 + "Cave_Pan_*.ogg", max=5)
S("fire.burst", ORPG + "spell_fire_*.ogg", max=7)
S("electric", FSX + "electrical/EL-blow_*.wav", max=6)
S("splash", WATER + "splash_*.ogg", max=8)
S("splash.big", *bsb(1519, 1520, 1521), max=3, maxdur=2.5, fout=0.6)
S("chain.rattle", ORPG + "chain_0*.ogg", *bsb(359, 360), max=5)
S("creak", RPG + "creak*.ogg", WM + "wood_squeak_*.ogg", max=5)
S("cloth.flap", *bsb(1633), dur=12, split=True, gap=0.15, max=4, maxdur=1.2)
S("bones", *bsb(1409), ART + "NPC/beetle/bite-small*.wav", max=4)
S("metal.clank", IMP + "impactMetal_heavy_*.ogg", max=5)
S("wood.thud", IMP + "impactWood_medium_*.ogg", max=5)
S("spring", O100 + "spring_0*.ogg", max=6)
S("pop", FSA + "abstract/pop*.wav", max=4)
S("cork", *bsb(211, 648), max=2)
S("fuse", *bsb(1278), dur=6, gain=-6)
S("hammer", *bsb(5, 6), split=True, gap=0.12, max=6)
S("ratchet", *bsb(795, 794), dur=3, gain=-3)
S("crank", *bsb(2545), dur=3)
S("twang", *bsb(549), WM + "metal_spring_*.ogg", max=3)
S("arrow.loose", *bsb(549), ART + "battle/swing*.wav", rate=1.1, max=4)
S("arrow.hit", *bsb(548), split=True, gap=0.15, max=6)
S("knife", *bsb(2574, 2575, 2576, 2577, 2578), max=5, maxdur=0.8)
S("slap", *bsb(597), split=True, gap=0.12, max=6)
S("burp", OC1 + "burp_0*.ogg", ART + "misc/burp.wav", *bsb(1707, 1708, 1709), max=6)
S("gulp", *bsb(352, 353, 354), split=True, max=5, maxdur=0.8)
S("cheer", *bsb(237, 236), max=2, maxdur=3, fout=0.8)
S("applause", *bsb(2363), maxdur=3, fout=1)
S("bird.chirp", *bsb(1670, 3503, 3087), split=True, gap=0.1, max=8, maxdur=0.9)
S("bird.screech", *bsb(1762), split=True, max=3)
S("leaves", *bsb(137, 1299, 1300), split=True, gap=0.2, max=6, maxdur=1.2)
S("bubble", WATER + "bubble_*.ogg", ART + "inventory/bubble*.wav", max=6, gain=-3)
S("sizzle", *bsb(987), dur=8, maxdur=2.5, fout=0.6, gain=-4)
S("firecracker", *bsb(1140), max=2)
S("drum", *bsb(2338), max=1, maxdur=1.5)
S("drumroll", *bsb(2402), maxdur=3)
S("cannon", BANG + "cannon_0*.ogg", max=5)
S("bell.small", *bsb(292), split=True, max=2, maxdur=3, fout=1)
S("bell.church", *bsb(135), maxdur=6, fout=2)
S("gong", O100 + "gong_0*.ogg", maxdur=4, fout=1.5)
S("bugle", *bsb(3263), dur=6, fout=0.4)
S("glass", IMP + "impactGlass_heavy_*.ogg", max=5)
S("gate.open", *bsb(2355, 2357), max=2)
S("latch", RPG + "metalLatch.ogg", RPG + "metalClick.ogg")
S("coins", RPG + "handleCoins*.ogg", ORPG + "item_coins_0*.ogg", max=5)
S("crowd.gasp", OC1 + "ooh.ogg")

# ── Footsteps (heroes only, very quiet in the mix) ──
S("step.grass", IMP + "footstep_grass_*.ogg", max=5)
S("step.stone", IMP + "footstep_concrete_*.ogg", max=5)
S("step.snow", IMP + "footstep_snow_*.ogg", max=5)
S("step.wood", IMP + "footstep_wood_*.ogg", max=5)
S("step.dirt", RPG + "footstep0*.ogg", max=8)
S("step.sand", *bsb(510), split=True, gap=0.08, max=6, lp=6000)
S("step.water", O100B + "sfx100v2_footstep_wet_*.ogg", max=3)
S("step.armor", ART + "inventory/chainmail*.wav", ART + "inventory/armor-light.wav", max=3, maxdur=0.35, gain=-6)
S("step.bark", WM + "wood_hit_*.ogg", rate=0.7, max=5, maxdur=0.3)

# ── Voices: per champion attack / big / hurt / death / taunt (pitch-cast from shared CC0 packs) ──
def voice(hero, pack, lines, rate, **kw):
    for line, pats in lines.items():
        S(f"vo.{hero}.{line}", *[pack + p for p in pats], rate=rate, max=6, **kw)


ORC_L = {"attack": ["attack*.wav", "lightattack*.wav"], "big": ["heavyattack*.wav", "angry*.wav"],
         "hurt": ["hit*.wav"], "death": ["death*.wav"], "taunt": ["laugh*.wav", "excited*.wav"]}
WAR_L = {"attack": ["attack*.wav", "lightattack*.wav"], "big": ["heavyattack*.wav", "angry*.wav"],
         "hurt": ["hit*.wav"], "death": ["death*.wav"], "taunt": ["laugh*.wav", "amused*.wav"]}
ADV_L = {"attack": ["attack[0-8].wav"], "big": ["attackbig*.wav"], "hurt": ["hurt*.wav"], "death": ["death*.wav"],
         "taunt": ["victory*.wav", "yes*.wav"]}
voice("warlord", ORC, ORC_L, 0.84)
voice("raider", ORC, ORC_L, 1.5, hp=280)  # a wiry goblin, not a big orc
voice("duelist", WAR, WAR_L, 1.08)
voice("warden", WAR, WAR_L, 0.74)
voice("herald", WAR, {**WAR_L, "order": ["yes*.wav", "yesconfirm*.wav", "here*.wav", "hut*.wav"]}, 0.95)
voice("engineer", ADV, ADV_L, 0.94)
voice("friar", ADV, ADV_L, 0.8)
# Brindle: the adventurer pack pitched up into a croaky frog (the committed files were cut from vo.engineer.* with
# ffmpeg: asetrate x1.3, highpass 180, lowpass 7000, vibrato 18 Hz / 0.25).
voice("harpooner", ADV, ADV_L, 1.22, hp=180, lp=7000)
voice("marksman", FEM, {"attack": ["attack*.wav"], "big": ["jump*.wav"], "hurt": ["damaged*.wav"],
                        "death": ["damaged3.wav"], "taunt": ["healed*.wav"]}, 1.0)
voice("summoner", ZOM, {"attack": ["humanYell[1-3].wav"], "big": ["humanYell[4-5].wav"], "hurt": ["humanYell*.wav"],
                        "death": ["humanDeath*.wav"], "taunt": ["zombieYell[1-3].wav"]}, 0.9)
voice("wreckwitch", FEM, {"attack": ["attack*.wav"], "big": ["jump*.wav"], "hurt": ["damaged[12].wav"],
                          "death": ["damaged3.wav"], "taunt": ["healed*.wav"]}, 0.74)  # an old sea-hag, cast low
S("vo.undead", ZOM + "zombieYell*.wav", ZOM + "zombieDeath*.wav", max=8, gain=-3)

# ── Champions: signature sounds ──
S("warlord.slam", BOOM + "explosion-0[7-9].wav", rate=0.6, lp=2500, max=3, maxdur=1.6, fout=0.5)
S("warlord.quake", FSA + "misc/earthquake.wav", rate=0.8, maxdur=3, fout=1)
S("stig.wrench", WOOSH + "Twirl Smol *.wav", max=6)
S("stig.rivet", *bsb(5), split=True, gap=0.1, max=4, hp=300)
S("stig.works", WM + "wood_cracking_*.ogg", WM + "wood_squeak_*.ogg", max=5)
S("grim.smoke", P2 + "Shake_Wind_*.ogg", max=3)
S("remnil.army", ZOM + "zombieYell*.wav", rate=0.75, max=6)
S("francois.ring", IMP + "impactBell_heavy_*.ogg", rate=1.5, max=4, gain=-4)
S("thorn.grow", WM + "wood_cracking_*.ogg", WM + "wood_squeak_*.ogg", rate=0.7, max=6)
S("wren.draw", RPG + "handleSmallLeather*.ogg", RPG + "beltHandle*.ogg", rate=0.85, max=4, gain=-4)
S("maddock.keg", IMP + "impactPlank_medium_*.ogg", WM + "wood_slam_*.ogg", rate=0.8, max=6)
S("kelp.anchor", IMP + "impactMetal_heavy_*.ogg", rate=0.7, max=5)
S("kelp.slime", WATER + "slime_*.ogg", max=8)
S("kelp.spit", FEM + "water.wav", FEM + "aqua.wav", FEM + "bubbles.wav", rate=0.9, max=3, maxdur=1.2)
S("kelp.curse", FEM + "curse.wav", FEM + "hex.wav", rate=0.8, max=2, maxdur=1.6)
S("herald.flag", *bsb(1633), dur=20, split=True, gap=0.1, max=4, maxdur=1.0)

# ── Soldiers, ogre, serpent ──
S("unit.death", OC1 + "hurt_0*.ogg", OC2 + "die_0*.ogg", STM + "Guard_Die_001_0.wav", STM + "Archer_Die_001.wav",
  STM + "Crossbowman_Die_001.wav", max=8, gain=-2)
S("unit.attack", OC2 + "attack_0*.ogg", OC1 + "grunt_0*.ogg", max=8, gain=-4)
S("ogre.voice", ART + "NPC/giant/giant*.wav", max=5)
S("ogre.roar", OC1 + "troll_0*.ogg", OC1 + "roar_0*.ogg", rate=0.75, max=6)
S("ogre.step", OC2 + "stomp_01.ogg", IMP + "impactSoft_heavy_*.ogg", rate=0.6, max=4)
S("serpent.roar", ORPG + "creature_roar_0*.ogg", OC2 + "roar_0*.ogg", rate=0.55, lp=4000, max=6)
S("serpent.growl", BEAST + "Growl*.wav", rate=0.6, max=3)

# ── Structures ──
S("build.work", WM + "hammer_*.ogg", O100 + "tools_0*.ogg", max=8)
S("build.saw", *bsb(559), dur=3)
S("collapse", BFH + "rock_falling_0[6-9].ogg", BFH + "wood_falling_*.ogg", WM + "wood_falling_*.ogg", max=8)

# ── UI and announcer ──
S("ui.move", UIA + "rollover*.ogg", max=4, gain=-6)
S("ui.ok", IFC + "select_00[1-4].ogg", max=4)
S("ui.back", IFC + "back_00*.ogg", max=4)
S("ui.error", IFC + "error_00[1-4].ogg", max=4)
S("ui.tick", IFC + "tick_00*.ogg", max=3)
S("ui.page", RPG + "bookFlip*.ogg", max=3)
S("ui.open", IFC + "open_00*.ogg", max=4)
S("ui.close", IFC + "close_00*.ogg", max=4)
S("ui.toggle", IFC + "toggle_00*.ogg", max=4)
S("ui.seal", RPG + "bookPlace*.ogg", IMP + "impactSoft_medium_*.ogg", max=4)
S("ui.peel", RPG + "bookOpen.ogg", RPG + "bookClose.ogg")
S("ui.key", UIA + "click*.ogg", max=5, gain=-4)
S("ui.join", IFC + "maximize_00[1-4].ogg", max=4)
S("ui.leave", IFC + "minimize_00[1-4].ogg", max=4)
S("ui.coins", RPG + "handleCoins*.ogg", max=2)
S("jingle.win", JNG + "Pizzicato jingles/jingles_PIZZI0[0-2].ogg", max=3)
S("jingle.lose", JNG + "Pizzicato jingles/jingles_PIZZI1[0-2].ogg", max=3)
for w in ["1", "2", "3", "fight", "sudden_death", "winner", "game_over", "it's_a_tie", "prepare_yourself",
          "flawless_victory", "final_round"]:
    S("ann." + w.replace("'", ""), ANN + f"{w}.ogg", gain=2)

# ── Ambience beds (stereo loops) and map one-shots ──
S("bed.meadow", *bsb(97), loop=40, stereo=True)
S("bed.forest", *bsb(100), loop=40, stereo=True)
S("bed.river", *bsb(823), loop=30, stereo=True)
S("bed.surf", *bsb(1446), loop=40, stereo=True)
S("bed.gulls", *bsb(2573), loop=40, stereo=True)
S("bed.wind", *bsb(595), loop=40, stereo=True)
S("bed.gale", *bsb(146), loop=40, stereo=True)
S("bed.grass", *bsb(908), loop=40, stereo=True)
S("bed.birds", *bsb(1859), loop=40, stereo=True)
S("bed.night", *bsb(315), loop=40, stereo=True)
S("bed.crickets", *bsb(1020), loop=30, stereo=True)
S("bed.insects", *bsb(425), loop=14, stereo=True)
S("bed.fire", *bsb(2857), loop=30, stereo=True)
S("bed.boil", *bsb(149), loop=12, stereo=True)
S("bed.stream", *bsb(2754), loop=40, stereo=True)
S("crow", *bsb(956, 3464), split=True, gap=0.15, max=5)
S("owl", *bsb(1764, 1763, 429), split=True, gap=0.4, max=5, maxdur=2)
S("tide.wave", *bsb(267), dur=20, split=True, gap=0.6, floor=-18, max=3, maxdur=4, fout=1.5)
S("whistle.wind", *bsb(155), dur=8, maxdur=6, fout=2)
S("thunder", *bsb(3113, 3114), maxdur=5, fout=2)
