# Writes scenes.json for the example explainer: the props are small SVGs drawn in code.
# Usage: python make-scenes.py scenes.json
import json, sys, math
INK = "#2a2346"
def svg(vb, body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>'

plate = svg("0 0 220 160", f'<rect x="8" y="14" width="204" height="138" rx="8" fill="#3d3856" stroke="{INK}" stroke-width="5"/><rect x="24" y="30" width="172" height="106" fill="#e2dccb" stroke="{INK}" stroke-width="3"/><ellipse cx="86" cy="84" rx="40" ry="26" fill="#4e4766" opacity=".6"/><ellipse cx="138" cy="78" rx="30" ry="20" fill="#4e4766" opacity=".5"/><ellipse cx="110" cy="96" rx="22" ry="12" fill="#4e4766" opacity=".4"/>')
rock = svg("0 0 140 110", f'<path d="M10,92 L24,46 L56,24 L94,30 L126,58 L120,94 Z" fill="#b9c86a" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/><path d="M34,68 l16,-12 M70,46 l18,9 M78,78 l20,-7" stroke="{INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>')
rays = svg("0 0 240 240", '<g stroke="#f6e27a" stroke-width="7" stroke-linecap="round" fill="none">' + "".join(f'<line x1="{120+70*math.cos(a):.1f}" y1="{120+70*math.sin(a):.1f}" x2="{120+105*math.cos(a):.1f}" y2="{120+105*math.sin(a):.1f}"/>' for a in [i*math.pi/5 for i in range(10)]) + '</g>')
def tile(sym, num, col): return svg("0 0 120 120", f'<rect x="6" y="6" width="108" height="108" rx="10" fill="{col}" stroke="{INK}" stroke-width="5"/><text x="60" y="82" text-anchor="middle" font-family="Georgia,serif" font-size="54" font-weight="700" fill="{INK}">{sym}</text><text x="18" y="32" font-family="Georgia,serif" font-size="20" fill="{INK}">{num}</text>')
nuc = ""
pts = [(0,0),(22,0),(-22,0),(11,19),(-11,19),(11,-19),(-11,-19),(33,19),(-33,19),(33,-19),(-33,-19),(0,38),(0,-38),(22,38),(-22,38),(22,-38),(-22,-38),(44,0),(-44,0)]
for k,(x,y) in enumerate(pts):
    col = "#e2604f" if k % 2 else "#5b8fd6"
    nuc += f'<circle cx="{110+x}" cy="{110+y}" r="16" fill="{col}" stroke="{INK}" stroke-width="3.5"/>'
nucleus = svg("0 0 220 220", nuc)
alpha = svg("0 0 80 80", "".join(f'<circle cx="{40+x}" cy="{40+y}" r="15" fill="{c}" stroke="{INK}" stroke-width="3.5"/>' for x,y,c in [(-10,-10,"#e2604f"),(10,10,"#e2604f"),(10,-10,"#5b8fd6"),(-10,10,"#5b8fd6")]))
beta = svg("0 0 40 40", f'<circle cx="20" cy="20" r="11" fill="#f2d14b" stroke="{INK}" stroke-width="3.5"/>')
gamma = svg("0 0 320 60", '<path d="M0,30 q20,-26 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0" stroke="#f6e27a" stroke-width="7" fill="none" stroke-linecap="round"/>')
def bar(h, col): return svg("0 0 70 210", f'<rect x="8" y="{200-h*1.9:.1f}" width="54" height="{h*1.9:.1f}" rx="4" fill="{col}" stroke="{INK}" stroke-width="4"/>')
log = svg("0 0 200 160", f'<ellipse cx="100" cy="80" rx="90" ry="70" fill="#c98d55" stroke="{INK}" stroke-width="5"/>' + "".join(f'<ellipse cx="100" cy="80" rx="{r}" ry="{r*0.78:.1f}" fill="none" stroke="#8a5a32" stroke-width="3"/>' for r in [70,52,36,20]) + '<circle cx="100" cy="80" r="5" fill="#8a5a32"/>')
bone = svg("0 0 220 80", f'<path d="M40,30 C24,10 4,24 14,40 C4,56 24,70 40,50 L180,50 C196,70 216,56 206,40 C216,24 196,10 180,30 Z" fill="#f3ead6" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>')
cross = svg("0 0 140 140", f'<circle cx="70" cy="70" r="62" fill="#f6f1e6" stroke="{INK}" stroke-width="5"/><path d="M56,28 h28 v28 h28 v28 h-28 v28 h-28 v-28 h-28 v-28 h28 Z" fill="#e2604f" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
rocket = svg("0 0 120 200", f'<path d="M60,8 C90,40 92,110 84,150 L36,150 C28,110 30,40 60,8 Z" fill="#eef0f4" stroke="{INK}" stroke-width="5"/><circle cx="60" cy="70" r="16" fill="#5b8fd6" stroke="{INK}" stroke-width="4"/><path d="M36,120 L14,160 L38,150 Z M84,120 L106,160 L82,150 Z" fill="#e2604f" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/><path d="M44,152 Q60,196 76,152 Z" fill="#f2b84b" stroke="{INK}" stroke-width="4"/>')
detector = svg("0 0 160 160", f'<circle cx="80" cy="80" r="70" fill="#f4f1ea" stroke="{INK}" stroke-width="5"/><circle cx="80" cy="80" r="44" fill="none" stroke="{INK}" stroke-width="3"/>' + "".join(f'<circle cx="{80+26*math.cos(a):.1f}" cy="{80+26*math.sin(a):.1f}" r="4" fill="{INK}"/>' for a in [i*math.pi/4 for i in range(8)]) + f'<circle cx="120" cy="120" r="7" fill="#e2604f" stroke="{INK}" stroke-width="2"/>')
medal = svg("0 0 140 190", f'<path d="M40,6 L70,70 L100,6 Z" fill="#5b8fd6" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="70" cy="118" r="58" fill="#f2c14b" stroke="{INK}" stroke-width="5"/><circle cx="70" cy="118" r="40" fill="none" stroke="#b8862a" stroke-width="4"/><text x="70" y="134" text-anchor="middle" font-family="Georgia,serif" font-size="44" font-weight="700" fill="#8a5a1a">N</text>')
notebook = svg("0 0 200 160", f'<rect x="20" y="16" width="160" height="128" rx="8" fill="#8a5a32" stroke="{INK}" stroke-width="5"/><rect x="34" y="28" width="134" height="104" fill="#f3ead6" stroke="{INK}" stroke-width="3"/>' + "".join(f'<path d="M46,{48+i*16} q30,-6 60,0 t50,0" stroke="#6b6688" stroke-width="3" fill="none"/>' for i in range(5)))
glow = svg("0 0 260 220", '<ellipse cx="130" cy="110" rx="120" ry="100" fill="#d6f27a" opacity=".35"/><ellipse cx="130" cy="110" rx="90" ry="74" fill="#d6f27a" opacity=".35"/>')

# Manim code for the half-life scene: the decay law, written by hand.
DECAY = r"""class Decay(Scene):
    def construct(self):
        f = MathTex(r'N(t) = N_0 \left(\tfrac{1}{2}\right)^{t/T}', color=INK).scale(3.2)
        self.play(Write(f), run_time=1.6)
"""

scenes = [
 # The host rises in, waves hello, and turns serious on "falling apart".
 {"say": ["Some atoms cannot sit still.", "Deep inside, they are slowly falling apart."],
  "background": "#7fb6d6",
  "character": {"x": .5, "scale": .97, "enter": "rise", "mood": "happy",
                "cues": [{"line": 0, "gesture": "wave"}, {"line": 1, "gesture": "explain", "mood": "serious"}]},
  "camera": {"from": {"zoom": 1}, "to": {"zoom": 1.08, "y": .42}},
  "items": [{"text": "?", "x": .76, "y": .3, "size": .2, "line": 1, "at": .3, "enter": "pop", "loop": "wobble"}],
  "hold": .9},
 # The camera starts on the rock and pans to the plate as it is drawn.
 {"say": ["In eighteen ninety-six, Henri Becquerel left uranium salts on a wrapped photographic plate.", "In the dark, the plate fogged anyway."],
  "background": "#e3a24a", "character": False, "transition": "push",
  "camera": {"from": {"zoom": 1.25, "x": .3, "y": .55}, "keys": [{"at": 2.2, "zoom": 1.1, "x": .55, "y": .5, "dur": 1.6}, {"line": 1, "zoom": 1.2, "x": .45, "y": .55, "dur": 1.5}]},
  "items": [{"text": "1896", "x": .2, "y": .22, "size": .16, "at": .3},
            {"svg": rock, "x": .3, "y": .6, "w": .14, "at": .6, "loop": "shake", "sound": False},
            {"svg": plate, "x": .64, "y": .52, "w": .34, "at": 2.0, "enter": "draw"},
            {"svg": rays, "x": .3, "y": .6, "w": .26, "line": 1, "enter": "fade", "loop": "pulse"}],
  "hold": .6},
 # Points at the word as it is written; smiles at the discovery.
 {"say": ["Marie Curie named this energy radioactivity.", "With Pierre Curie, she discovered two new elements: polonium and radium."],
  "background": "#7b6fc4", "transition": "wipe",
  "character": {"x": .24, "y": .97, "scale": .9, "look": .5, "cues": [{"at": 1.0, "gesture": "point"}, {"line": 1, "gesture": "present", "mood": "happy"}]},
  "camera": {"from": {"zoom": 1}, "to": {"zoom": 1.04}},
  "items": [{"text": "RADIOACTIVITY", "x": .66, "y": .24, "size": .1, "at": 1.0, "color": "#f6f1e6", "mark": "underline", "markColor": "#f2c14b"},
            {"svg": tile("Po", 84, "#f6efe0"), "x": .58, "y": .58, "w": .14, "line": 1, "at": 1.4, "loop": "bob"},
            {"svg": tile("Ra", 88, "#e7f6c9"), "x": .78, "y": .58, "w": .14, "line": 1, "at": 2.4, "loop": "bob"}],
  "hold": .6},
 # The nucleus is drawn, shakes, and throws out particles that fly off the edge.
 {"say": ["An unstable nucleus breaks apart, and throws out energy as fast particles or rays."],
  "background": "#d98aa8", "character": False, "transition": "zoom",
  "camera": {"from": {"zoom": 1.3, "x": .36, "y": .48}, "keys": [{"at": 1.6, "zoom": 1, "x": .5, "y": .5, "dur": 1.2}]},
  "items": [{"svg": nucleus, "x": .34, "y": .48, "w": .26, "at": .1, "enter": "draw", "loop": "shake"},
            {"svg": alpha, "x": .45, "y": .4, "w": .07, "at": 1.6, "enter": "pop", "move": {"x": .74, "y": .28, "at": 1.7, "dur": .6}},
            {"text": "alpha", "x": .86, "y": .28, "size": .06, "at": 2.2},
            {"svg": beta, "x": .45, "y": .5, "w": .035, "at": 2.3, "enter": "pop", "move": {"x": .74, "y": .5, "at": 2.4, "dur": .5}},
            {"text": "beta", "x": .84, "y": .5, "size": .06, "at": 2.8},
            {"svg": gamma, "x": .66, "y": .7, "w": .22, "at": 3.1, "enter": "draw"},
            {"text": "gamma", "x": .88, "y": .7, "size": .06, "at": 3.7}],
  "hold": .8},
 # Thinks about it, then explains; the bars halve one after another.
 {"say": ["Each kind of atom has a half-life:", "the time it takes for half of its atoms to change."],
  "background": "#8fc6a0", "transition": "iris",
  "character": {"x": .2, "y": .96, "scale": .85, "cues": [{"line": 0, "gesture": "think", "mood": "curious"}, {"line": 1, "gesture": "explain", "mood": "neutral"}]},
  "camera": {"from": {"zoom": 1}, "to": {"zoom": 1.03}},
  "items": [{"text": "half-life", "x": .5, "y": .16, "size": .09, "at": .4, "mark": "circle"},
            {"chart": {"type": "bar", "values": [100, 50, 25, 12.5], "labels": ["0", "T", "2T", "3T"], "unit": "%"}, "x": .62, "y": .6, "w": .42, "line": 1, "look": False}],
  # The decay law, written by Manim in the top right.
  "manim": {"code": DECAY, "x": .8, "y": .2, "w": .4, "line": 1, "at": 1.6},
  "hold": .6},
 {"say": ["Carbon fourteen has a half-life of about five thousand, seven hundred years,", "so it can date ancient wood and bone."],
  "background": "#e3a24a", "character": False, "transition": "push",
  "camera": {"from": {"zoom": 1.1, "x": .5, "y": .3}, "keys": [{"line": 1, "zoom": 1.0, "x": .5, "y": .5, "dur": 1.2}]},
  "items": [{"text": "carbon-14 ≈ {n} years", "count": {"from": 0, "to": 5730, "dur": 2.2}, "x": .5, "y": .2, "size": .09, "at": .3, "enter": "fade", "mark": "underline", "markAt": 3.0},
            {"svg": log, "x": .33, "y": .58, "w": .26, "line": 1, "enter": "draw"},
            {"svg": bone, "x": .68, "y": .6, "w": .3, "line": 1, "at": .8, "enter": "draw"}],
  "hold": .6},
 {"say": ["Today, radioactivity treats cancer, powers spacecraft, and guards homes in smoke detectors."],
  "background": "#7fb6d6", "character": False, "transition": "fade",
  "camera": {"from": {"zoom": 1.15, "x": .25, "y": .5}, "keys": [{"at": 1.8, "zoom": 1.15, "x": .5, "y": .5, "dur": 1.0}, {"at": 3.2, "zoom": 1.0, "x": .5, "y": .5, "dur": 1.0}]},
  "items": [{"svg": cross, "x": .22, "y": .5, "w": .17, "at": 1.0, "loop": "float"},
            {"svg": rocket, "x": .5, "y": .48, "w": .12, "at": 2.0, "enter": "slide-up", "loop": "bob"},
            {"svg": detector, "x": .78, "y": .5, "w": .17, "at": 3.3, "loop": "float"}],
  "hold": .6},
 # Presents the two prizes, is surprised by the notebooks, then waves goodbye.
 {"say": ["Marie Curie became the first person to win two Nobel Prizes.", "Her notebooks are still radioactive today."],
  "background": "#7b6fc4", "transition": "wipe",
  "character": {"x": .5, "scale": .95, "mood": "happy", "cues": [{"line": 0, "at": .4, "gesture": "present"}, {"line": 1, "gesture": "point", "mood": "surprised"}, {"line": 1, "at": 2.6, "gesture": "wave", "mood": "happy"}]},
  "camera": {"from": {"zoom": 1.06}, "to": {"zoom": 1}},
  "items": [{"svg": medal, "x": .15, "y": .42, "w": .1, "at": 1.2, "loop": "wobble"},
            {"svg": medal, "x": .27, "y": .42, "w": .1, "at": 1.6, "loop": "wobble"},
            {"svg": glow, "x": .8, "y": .48, "w": .26, "line": 1, "enter": "fade", "loop": "pulse", "look": False},
            {"svg": notebook, "x": .8, "y": .48, "w": .2, "line": 1, "enter": "draw", "mark": "circle", "markAt": 1.6}],
  "hold": 1.2},
]
# Scenery per scene: a backdrop that moves slower than the camera, and particles in front.
for s_, (bd, pt) in zip(scenes, [("dots", "dust"), ("room", "none"), ("stars", "sparkles"), ("grid", "sparkles"),
                                 ("grid", "none"), ("grass", "none"), ("clouds", "none"), ("stars", "sparkles")]):
    s_["backdrop"] = bd
    s_["particles"] = pt
spec = {"title": "Why do some atoms glow?", "voice": "kokoro:af_heart", "scenes": scenes}
json.dump(spec, open(sys.argv[1], "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(sum(len(" ".join(s["say"]).split()) for s in scenes), "words")
