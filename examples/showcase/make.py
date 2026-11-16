# Writes the ten showcase scene files: one explainer per field, each with a different host mode, voice and
# set of devices. Props that the library lacks are drawn here as small SVGs in the house style.
# Usage: python make.py            (writes <name>.json next to this file)
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
INK = "#2a2346"
REPO = "github.com/logitsolutionsai/selfclone"


def svg(vb, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>'


def endcard(scene, last, tall=False):
    """A closing card over everything, shown in the hold after the last sentence."""
    band = svg("0 0 1000 220", '<rect x="0" y="0" width="1000" height="220" rx="28" fill="#1d1840" opacity=".9"/>')
    w, big, small, dy = (.94, .06, .026, .028) if tall else (.66, .085, .036, .045)
    scene.setdefault("items", []).extend([
        {"svg": band, "x": .5, "y": .5, "w": w, "lineEnd": last, "at": .15, "enter": "fade", "over": True, "sound": False},
        {"text": "Made with selfclone", "x": .5, "y": .5 - dy * .8, "size": big, "color": "#f6f1e6", "lineEnd": last, "at": .3, "over": True},
        {"text": REPO, "x": .5, "y": .5 + dy, "size": small, "font": "sans", "color": "#f2c14b", "lineEnd": last, "at": .9, "enter": "fade", "over": True},
    ])
    scene["hold"] = max(scene.get("hold", 0), 2.6)


def finish(name, spec, tall=False):
    last = spec["scenes"][-1]
    endcard(last, len(last["say"]) - 1 if isinstance(last["say"], list) else 0, tall)
    spec.setdefault("music", "ambient")
    with open(os.path.join(HERE, f"{name}.json"), "w", encoding="utf8", newline="\n") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    words = sum(len((l if isinstance(l, str) else l["text"]).split()) for s in spec["scenes"] for l in (s["say"] if isinstance(s["say"], list) else [s["say"]]))
    print(f"{name}: {len(spec['scenes'])} scenes, {words} words")


# ---- drawings ----
def network():
    layers = [3, 4, 4, 2]
    xs = [40, 150, 260, 370]
    pts = [[(x, 30 + (220 - 30) * (k + .5) / n) for k in range(n)] for x, n in zip(xs, layers)]
    body = ""
    for a, b in zip(pts, pts[1:]):
        for p in a:
            for q in b:
                body += f'<line x1="{p[0]}" y1="{p[1]:.1f}" x2="{q[0]}" y2="{q[1]:.1f}" stroke="#6b6688" stroke-width="2.5"/>'
    cols = ["#5b8fd6", "#f2c14b", "#f2c14b", "#e2604f"]
    for i, layer in enumerate(pts):
        for p in layer:
            body += f'<circle cx="{p[0]}" cy="{p[1]:.1f}" r="17" fill="{cols[i]}" stroke="{INK}" stroke-width="4"/>'
    return svg("0 0 410 250", body)


SEVEN = svg("0 0 120 160", f'<rect x="6" y="6" width="108" height="148" rx="8" fill="#f6f1e6" stroke="{INK}" stroke-width="5"/><path d="M30,40 L90,40 L52,130" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>')
FORCES = svg("0 0 420 300", f'''<path d="M120,150 C140,128 300,128 330,140 L360,150 L330,160 C300,172 140,172 120,150 Z" fill="#eef0f4" stroke="{INK}" stroke-width="5"/>
<path d="M210,148 L170,100 L200,100 L250,148 Z M210,152 L170,200 L200,200 L250,152 Z" fill="#cfe0ea" stroke="{INK}" stroke-width="4"/>
<g stroke-width="7" stroke-linecap="round" fill="none"><path d="M230,95 L230,30" stroke="#6aa34c"/><path d="M230,205 L230,270" stroke="#e2604f"/><path d="M370,150 L410,150" stroke="#5b8fd6"/><path d="M110,150 L60,150" stroke="#f2c14b"/></g>
<g font-family="'Ink Free','Segoe Print','Comic Sans MS',cursive" font-size="24" fill="{INK}"><text x="244" y="40">lift</text><text x="244" y="280">weight</text><text x="352" y="128">thrust</text><text x="40" y="128">drag</text></g>''')
WING = svg("0 0 460 220", f'''<g fill="none" stroke="#f6f1e6" stroke-width="5" stroke-linecap="round" opacity=".95">
<path d="M10,70 C120,70 200,40 300,60 C360,72 400,110 450,140"/><path d="M10,110 C110,110 200,120 300,130 C360,138 400,160 450,185"/><path d="M10,160 C120,160 220,170 300,175 C360,180 400,195 450,210"/></g>
<path d="M90,118 C140,70 290,70 380,128 C300,118 170,120 90,118 Z" fill="#eef0f4" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>''')
UP = svg("0 0 80 120", f'<path d="M40,8 L72,50 L52,50 L52,112 L28,112 L28,50 L8,50 Z" fill="#6aa34c" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
NEURON = svg("0 0 520 200", f'''<g fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round">
<path d="M90,100 L30,50 M90,100 L20,105 M90,100 L35,160 M60,72 L40,30 M55,128 L60,175"/>
<path d="M120,100 L440,100" stroke-width="9"/>
<path d="M440,100 L490,60 M440,100 L500,100 M440,100 L490,140"/></g>
<g fill="#f2c14b" stroke="{INK}" stroke-width="3">{"".join(f'<rect x="{150 + i * 55}" y="88" width="40" height="24" rx="12"/>' for i in range(5))}</g>
<circle cx="100" cy="100" r="34" fill="#d98aa8" stroke="{INK}" stroke-width="5"/><circle cx="100" cy="100" r="11" fill="#b58ad6" stroke="{INK}" stroke-width="3"/>''')
PULSE = svg("0 0 40 40", '<circle cx="20" cy="20" r="14" fill="#f6e27a" stroke="#2a2346" stroke-width="3"/>')
SYNAPSE = svg("0 0 420 260", f'''<path d="M20,40 C120,40 170,70 170,130 C170,190 120,220 20,220" fill="#d98aa8" stroke="{INK}" stroke-width="5"/>
<path d="M400,40 C300,40 250,70 250,130 C250,190 300,220 400,220" fill="#b58ad6" stroke="{INK}" stroke-width="5"/>
{"".join(f'<circle cx="{120 + (k % 3) * 18}" cy="{90 + (k // 3) * 26}" r="7" fill="#f2c14b" stroke="{INK}" stroke-width="2"/>' for k in range(9))}
<g fill="#6aa34c" stroke="{INK}" stroke-width="2">{"".join(f'<rect x="246" y="{82 + k * 26}" width="14" height="12" rx="3"/>' for k in range(4))}</g>''')
DOTS = svg("0 0 80 60", f'<g fill="#f2c14b" stroke="{INK}" stroke-width="2"><circle cx="15" cy="20" r="7"/><circle cx="40" cy="35" r="7"/><circle cx="62" cy="18" r="7"/><circle cx="30" cy="48" r="6"/></g>')


def ship(planks, old=False):
    cols = ["#8a5a32" if not old else "#6b5a4a", "#c98d55", "#b07a3e"]
    hull = f'<path d="M20,120 L360,120 L320,190 L60,190 Z" fill="{cols[0]}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
    pl = "".join(f'<rect x="{60 + i * 52}" y="132" width="46" height="16" rx="3" fill="{"#f2c14b" if i < planks else cols[1]}" stroke="{INK}" stroke-width="2"/>' for i in range(5))
    pl += "".join(f'<rect x="{80 + i * 52}" y="156" width="46" height="16" rx="3" fill="{"#f2c14b" if i + 5 < planks else cols[2]}" stroke="{INK}" stroke-width="2"/>' for i in range(4))
    mast = f'<path d="M190,120 L190,20" stroke="{INK}" stroke-width="6"/><path d="M195,25 L300,100 L195,100 Z" fill="#f6f1e6" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
    return svg("0 0 380 200", mast + hull + pl)


EARTH_TILT = svg("0 0 220 260", f'''<path d="M70,20 L150,240" stroke="{INK}" stroke-width="5" stroke-dasharray="10 8"/>
<circle cx="110" cy="130" r="78" fill="#5b8fd6" stroke="{INK}" stroke-width="5"/>
<path d="M60,90 C80,80 100,110 90,130 C80,150 100,160 90,185 M140,70 C130,95 160,100 165,120 C170,140 150,150 160,175" fill="none" stroke="#8fc6a0" stroke-width="12" stroke-linecap="round"/>
<path d="M32,130 L188,130" stroke="{INK}" stroke-width="3" opacity=".5"/>''')
RAYS = lambda col: svg("0 0 260 120", f'<g stroke="{col}" stroke-width="8" stroke-linecap="round">' + "".join(f'<line x1="10" y1="{20 + i * 20}" x2="250" y2="{20 + i * 20}"/>' for i in range(5)) + '</g>')


# ---- 1. Neural networks (AI): one host ----
finish("neural-networks", {
    "title": "How does a neural network learn?",
    "cast": {"host": {"character": "random:nn-host-3", "voice": "kokoro:am_michael"}},
    "scenes": [
        {"say": ["A neural network is a stack of tiny calculators, called neurons.", "Each one weighs its inputs, adds them up, and passes the result on."],
         "background": "#7b6fc4", "backdrop": "grid", "title": "Neural networks", "titleColor": "#f6f1e6",
         "character": {"x": .2, "y": 1.0, "scale": .85, "enter": "rise", "name": "Your guide"},
         "items": [{"svg": network(), "x": .64, "y": .56, "w": .5, "line": 0, "at": 1.5, "enter": "draw"}]},
        {"say": ["Show it a picture of a handwritten seven, and it makes a guess.", "At first, it guesses one."],
         "background": "#5b8fd6", "backdrop": "dots", "transition": "push",
         "character": {"x": .2, "y": 1.0, "scale": .85},
         "items": [{"svg": SEVEN, "x": .45, "y": .45, "w": .12, "at": .6, "enter": "draw"},
                   {"prop": "arrow", "x": .6, "y": .45, "w": .1, "line": 0, "at": 2.0, "enter": "slide-left"},
                   {"text": "1 ?", "x": .76, "y": .45, "size": .14, "line": 1, "at": .2, "loop": "wobble"},
                   {"prop": "cross", "x": .87, "y": .3, "w": .07, "line": 1, "at": 1.0}]},
        {"say": ["So we measure how wrong it was, with a number called the loss.", "Then every weight gets nudged a little, in the direction that shrinks the loss."],
         "background": "#8fc6a0", "backdrop": "grid", "transition": "wipe",
         "character": {"x": .18, "y": 1.0, "scale": .8},
         "items": [{"text": "loss", "x": .62, "y": .16, "size": .09, "line": 0, "at": 1.6, "mark": "circle"},
                   {"chart": {"type": "line", "values": [9, 7.2, 5.1, 3.8, 2.6, 1.9, 1.4, 1.1, .9], "labels": ["start", "", "", "", "", "", "", "", "trained"], "showValues": False},
                    "x": .62, "y": .56, "w": .54, "line": 1, "at": .4}]},
        {"say": ["This trick is called backpropagation.", "Repeat it millions of times, and the guesses get good."],
         "background": "#7fb6d6", "backdrop": "clouds", "transition": "zoom",
         "character": {"x": .2, "y": 1.0, "scale": .85},
         "items": [{"text": "backpropagation", "x": .64, "y": .16, "size": .08, "at": .3, "mark": "underline"},
                   {"svg": SEVEN, "x": .5, "y": .5, "w": .1, "line": 1, "at": .8},
                   {"prop": "arrow", "x": .64, "y": .5, "w": .09, "line": 1, "at": 1.3, "enter": "slide-left"},
                   {"text": "7 ✓", "x": .8, "y": .5, "size": .14, "line": 1, "at": 1.8, "color": "#2f6b3a"},
                   {"prop": "check", "x": .8, "y": .3, "w": .07, "line": 1, "at": 2.4}]},
        {"say": ["That is all learning is, for a machine: lots of tiny corrections."],
         "background": "#7b6fc4", "backdrop": "stars", "particles": "sparkles", "transition": "iris",
         "character": {"x": .5, "y": 1.0, "scale": .9, "cues": [{"line": 0, "gesture": "present", "mood": "happy"}]},
         "items": [{"prop": "brain", "x": .2, "y": .35, "w": .14, "at": .5, "loop": "float"},
                   {"prop": "cpu", "x": .8, "y": .35, "w": .12, "at": 1.0, "loop": "float"}]},
    ]})

# ---- 2. Aerospace: dialogue, full-body guest ----
finish("aerospace", {
    "title": "How do planes fly?",
    "cast": {"host": {"character": "random:pilot-2", "voice": "kokoro:bf_emma"},
             "guest": {"character": "random:flyer-9", "voice": "kokoro:am_eric", "body": "full"}},
    "scenes": [
        {"say": [{"who": "host", "text": "A jumbo jet can weigh about four hundred tonnes."}, {"who": "guest", "text": "So how does it stay up there?"}],
         "background": "#7fb6d6", "backdrop": "clouds", "particles": "dust", "title": "How planes fly",
         "characters": {"host": {"x": .24, "enter": "rise", "name": "Captain Lee"}, "guest": {"x": .8, "scale": .78, "enter": "walk-right", "name": "Jo"}},
         "items": [{"prop": "plane", "x": .52, "y": .4, "w": .18, "line": 0, "at": 1.0, "enter": "slide-right", "loop": "float"}]},
        {"say": [{"who": "host", "text": "Four forces act on every plane: lift, weight, thrust, and drag."}],
         "background": "#f2ead6", "backdrop": "notebook", "transition": "push",
         "characters": {"host": {"x": .17, "scale": .78}},
         "items": [{"svg": FORCES, "x": .6, "y": .5, "w": .58, "at": .8, "enter": "draw"}]},
        {"say": [{"who": "host", "text": "The wing is curved and tilted, so it bends the oncoming air downward."}, {"who": "host", "text": "Push air down, and the air pushes the wing up."}],
         "background": "#5b8fd6", "backdrop": "clouds", "transition": "wipe",
         "characters": {"host": {"x": .17, "scale": .78}},
         "camera": {"from": {"zoom": 1.08, "x": .6}, "to": {"zoom": 1.0}},
         "items": [{"svg": WING, "x": .62, "y": .5, "w": .6, "at": .6, "enter": "draw"},
                   {"svg": UP, "x": .62, "y": .2, "w": .06, "line": 1, "at": 1.2, "loop": "bob"}]},
        {"say": [{"who": "guest", "text": "So faster means more lift?"}, {"who": "host", "text": "Yes! Double the speed, and you get about four times the lift."}],
         "background": "#8fc6a0", "backdrop": "grid", "transition": "zoom",
         "characters": {"host": {"x": .2, "scale": .78}, "guest": {"x": .84, "scale": .7}},
         "items": [{"chart": {"type": "bar", "values": [1, 4, 9], "labels": ["1× speed", "2× speed", "3× speed"], "unit": "× lift"}, "x": .52, "y": .5, "w": .42, "line": 1, "at": .3}]},
        {"say": [{"who": "host", "text": "That is why planes race down the runway, until the wings can carry them."}],
         "background": "#f2b84b", "backdrop": "city", "transition": "iris",
         "characters": {"host": {"x": .2, "scale": .8}, "guest": {"x": .84, "scale": .7}},
         "items": [{"prop": "plane", "x": .46, "y": .66, "w": .16, "at": .5, "move": {"x": .7, "y": .2, "at": 1.5, "dur": 3.2}}]},
    ]})

# ---- 3. Finance: one host, counters, chart, Manim ----
finish("finance", {
    "title": "How does money grow?",
    "cast": {"host": {"character": "random:money-5", "voice": "kokoro:af_sarah"}},
    "scenes": [
        {"say": ["Put one thousand dollars away at seven percent a year.", "After one year, you have one thousand and seventy."],
         "background": "#8fc6a0", "backdrop": "dots", "title": "Compound interest",
         "character": {"x": .2, "y": 1.0, "scale": .85, "enter": "rise"},
         "items": [{"prop": "coin", "x": .58, "y": .45, "w": .12, "at": 1.0, "loop": "bob"},
                   {"text": "${n}", "count": {"from": 1000, "to": 1070, "dur": 1.6}, "x": .78, "y": .45, "size": .12, "line": 1}]},
        {"say": ["The next year, you earn seven percent on everything, including last year's interest.", "That is compound interest: interest on your interest."],
         "background": "#f2ead6", "backdrop": "notebook", "transition": "push",
         "character": {"x": .18, "y": 1.0, "scale": .8},
         "items": [{"prop": "coin", "x": .5, "y": .4, "w": .08, "at": 1.0}, {"prop": "coin", "x": .6, "y": .4, "w": .08, "at": 1.4}, {"prop": "coin", "x": .7, "y": .4, "w": .08, "at": 1.8},
                   {"prop": "coin", "x": .8, "y": .4, "w": .05, "line": 0, "at": 3.2, "loop": "bob"},
                   {"text": "interest on interest", "x": .65, "y": .65, "size": .07, "line": 1, "at": .8, "mark": "underline"}]},
        {"say": ["In ten years, your money nearly doubles.", "In thirty years, it grows more than seven times."],
         "background": "#7b6fc4", "backdrop": "grid", "transition": "wipe",
         "character": {"x": .17, "y": 1.0, "scale": .78},
         "items": [{"chart": {"type": "bar", "values": [1000, 1967, 3870, 7612], "labels": ["today", "10 years", "20 years", "30 years"], "unit": "$"}, "x": .6, "y": .52, "w": .56, "at": .4}]},
        {"say": ["A quick trick: divide seventy-two by the interest rate, and you get the years it takes to double."],
         "background": "#f2ead6", "transition": "fade", "character": False,
         "manim": {"code": "class Rule(Scene):\n    def construct(self):\n        t = MathTex(r'\\frac{72}{7} \\approx 10', r'\\text{ years}', color=INK).scale(2.4)\n        self.play(Write(t), run_time=2)\n        self.play(Indicate(t[0], color=RED), run_time=1)\n        self.wait(1)\n"},
         "items": [{"text": "the rule of 72", "x": .5, "y": .18, "size": .08, "at": .3}]},
        {"say": ["The secret ingredient is not money. It is time."],
         "background": "#f2b84b", "backdrop": "dots", "particles": "sparkles", "transition": "iris",
         "character": {"x": .5, "y": 1.0, "scale": .9, "cues": [{"line": 0, "gesture": "think", "mood": "curious"}, {"line": 0, "at": 1.8, "gesture": "present", "mood": "happy"}]},
         "items": [{"prop": "hourglass", "x": .18, "y": .38, "w": .12, "at": 1.6, "loop": "wobble"}, {"prop": "clock", "x": .82, "y": .38, "w": .12, "at": 2.0, "loop": "float"}]},
    ]})

# ---- 6. English: dialogue at the chalkboard ----
finish("english", {
    "title": "Who or whom?",
    "cast": {"host": {"character": "random:teacher-21", "voice": "kokoro:bm_george"},
             "guest": {"character": "random:student-14", "voice": "kokoro:af_nicole"}},
    "captions": "words",
    "scenes": [
        {"say": [{"who": "guest", "text": "Who or whom? I never know which one to use."}, {"who": "host", "text": "Here is a trick that works every time."}],
         "background": "#2f5a46", "backdrop": "chalkboard", "title": "Who or whom?", "titleColor": "#f6f1e6",
         "characters": {"host": {"x": .24, "name": "Teacher"}, "guest": {"x": .78, "scale": .78, "name": "Alex"}}},
        {"say": [{"who": "host", "text": "Answer the question yourself, with he or him."}, {"who": "host", "text": "If the answer is he, use who. If it is him, use whom."}],
         "background": "#2f5a46", "backdrop": "chalkboard", "transition": "fade",
         "characters": {"host": {"x": .2, "scale": .85}},
         "items": [{"text": "he  →  who", "x": .65, "y": .35, "size": .11, "color": "#f6f1e6", "line": 1, "at": .5},
                   {"text": "him  →  whom", "x": .65, "y": .55, "size": .11, "color": "#f6f1e6", "line": 1, "at": 2.2, "mark": "underline", "markColor": "#f2c14b"}]},
        {"say": [{"who": "guest", "text": "Who wrote this book?"}, {"who": "host", "text": "He wrote it. He, so who!"}],
         "background": "#fbf7ec", "backdrop": "notebook", "transition": "wipe",
         "characters": {"host": {"x": .17, "scale": .8}, "guest": {"x": .84, "scale": .72}},
         "items": [{"text": "Who wrote this book?", "x": .5, "y": .3, "size": .08, "at": .3},
                   {"text": "He wrote it.", "x": .5, "y": .48, "size": .08, "line": 1, "at": .2, "color": "#3b5b8c", "mark": "circle"}]},
        {"say": [{"who": "guest", "text": "To who, or to whom, did you send the letter?"}, {"who": "host", "text": "I sent it to him. Him, so whom!"}],
         "background": "#fbf7ec", "backdrop": "notebook", "transition": "push",
         "characters": {"host": {"x": .17, "scale": .8}, "guest": {"x": .84, "scale": .72}},
         "items": [{"text": "To who?", "x": .38, "y": .3, "size": .08, "at": .5, "mark": "strike", "markAt": 1.6},
                   {"text": "To whom?", "x": .64, "y": .3, "size": .08, "at": 1.6, "color": "#2f6b3a"},
                   {"prop": "mail", "x": .5, "y": .55, "w": .1, "line": 1, "at": .3, "loop": "float"}]},
        {"say": [{"who": "host", "text": "Remember: him and whom both end in M."}],
         "background": "#2f5a46", "backdrop": "chalkboard", "particles": "dust", "transition": "iris",
         "characters": {"host": {"x": .22, "scale": .88, "cues": [{"line": 0, "gesture": "thumbs", "mood": "happy"}]}},
         "items": [{"text": "hiM  =  whoM", "x": .64, "y": .4, "size": .11, "color": "#f6f1e6", "at": .8, "mark": "box", "markColor": "#f2c14b"}]},
    ]})

# ---- 7. Neurology: one host, a neuron that fires ----
finish("neurology", {
    "title": "How do neurons talk?",
    "cast": {"host": {"character": "random:neuro-8", "voice": "kokoro:af_heart"}},
    "scenes": [
        {"say": ["Your brain has about eighty-six billion neurons.", "And right now, they are talking to each other."],
         "background": "#d98aa8", "backdrop": "dots", "title": "Neurons",
         "character": {"x": .2, "y": 1.0, "scale": .85, "enter": "rise", "name": "Dr. Okoro"},
         "items": [{"prop": "brain", "x": .62, "y": .45, "w": .18, "at": .6, "loop": "pulse"},
                   {"text": "{n}", "count": {"from": 0, "to": 86000000000, "dur": 2.4}, "x": .62, "y": .72, "size": .07, "line": 0, "at": .4}]},
        {"say": ["A neuron is a cell with short branches that listen, and one long wire that speaks."],
         "background": "#f2ead6", "backdrop": "notebook", "transition": "push",
         "character": {"x": .14, "y": 1.0, "scale": .72},
         "items": [{"svg": NEURON, "x": .6, "y": .45, "w": .72, "at": .5, "enter": "draw"},
                   {"text": "listen", "x": .3, "y": .2, "size": .06, "at": 2.6, "color": "#7a3b4a"},
                   {"text": "speak", "x": .82, "y": .2, "size": .06, "at": 3.6, "color": "#7a3b4a"}]},
        {"say": ["A signal races down the wire as a tiny electrical pulse,", "at up to about one hundred and twenty meters per second."],
         "background": "#f2ead6", "backdrop": "notebook", "transition": "fade",
         "character": {"x": .14, "y": 1.0, "scale": .72},
         "items": [{"svg": NEURON, "x": .6, "y": .45, "w": .72},
                   {"svg": PULSE, "x": .36, "y": .45, "w": .04, "at": .6, "loop": "pulse", "move": {"x": .86, "at": .9, "dur": 2.0}},
                   {"svg": PULSE, "x": .36, "y": .45, "w": .04, "line": 1, "at": .2, "loop": "pulse", "move": {"x": .86, "line": 1, "at": .5, "dur": 2.0}},
                   {"text": "up to 120 m/s", "x": .6, "y": .75, "size": .07, "line": 1, "at": .6, "mark": "underline"}]},
        {"say": ["At the end, it crosses a tiny gap called the synapse,", "carried by chemicals called neurotransmitters."],
         "background": "#7b6fc4", "backdrop": "grid", "transition": "zoom",
         "character": {"x": .14, "y": 1.0, "scale": .72},
         "camera": {"from": {"zoom": 1.15, "x": .6}, "to": {"zoom": 1.0}},
         "items": [{"svg": SYNAPSE, "x": .6, "y": .48, "w": .5, "at": .4, "enter": "draw"},
                   {"svg": DOTS, "x": .55, "y": .45, "w": .06, "line": 1, "at": .2, "move": {"x": .62, "line": 1, "at": .4, "dur": 1.4}, "loop": "float"},
                   {"text": "synapse", "x": .6, "y": .15, "size": .07, "line": 0, "at": 1.2, "color": "#f6f1e6", "mark": "circle", "markColor": "#f2c14b"}]},
        {"say": ["Every thought you have is billions of these little messages. Including this one!"],
         "background": "#d98aa8", "backdrop": "stars", "particles": "sparkles", "transition": "iris",
         "character": {"x": .5, "y": 1.0, "scale": .9, "cues": [{"line": 0, "gesture": "point", "mood": "happy"}]},
         "items": [{"prop": "brain", "x": .2, "y": .35, "w": .13, "at": .4, "loop": "pulse"}, {"prop": "lightning", "x": .8, "y": .35, "w": .1, "at": .9, "loop": "shake"}]},
    ]})

# ---- 8. Philosophy: dialogue, the Ship of Theseus ----
finish("philosophy", {
    "title": "The Ship of Theseus",
    "cast": {"host": {"character": "random:sage-12", "voice": "kokoro:bm_lewis"},
             "guest": {"character": "random:sailor-4", "voice": "kokoro:af_bella", "body": "full"}},
    "scenes": [
        {"say": [{"who": "host", "text": "Imagine a wooden ship. Over the years, every plank is replaced, one by one."}],
         "background": "#7fb6d6", "backdrop": "waves", "title": "The Ship of Theseus",
         "characters": {"host": {"x": .2, "enter": "rise", "scale": .85, "name": "Your guide"}},
         "items": [{"svg": ship(0), "x": .64, "y": .5, "w": .42, "at": .8, "enter": "draw"},
                   {"svg": ship(9), "x": .64, "y": .5, "w": .42, "at": 3.6, "enter": "fade", "loop": "bob"}]},
        {"say": [{"who": "guest", "text": "So, is it still the same ship?"}, {"who": "host", "text": "That puzzle comes to us from the Greek writer Plutarch, nearly two thousand years ago."}],
         "background": "#f2ead6", "backdrop": "notebook", "transition": "push",
         "characters": {"host": {"x": .2, "scale": .8}, "guest": {"x": .82, "scale": .75, "enter": "walk-right", "name": "Kai"}},
         "items": [{"bubble": "Same ship?", "who": "guest", "line": 0, "at": .4, "style": "thought"},
                   {"prop": "book", "x": .5, "y": .55, "w": .12, "line": 1, "at": 1.0}]},
        {"say": [{"who": "host", "text": "Now someone collects all the old planks, and builds them back into a ship."}, {"who": "host", "text": "Which one is the real Ship of Theseus?"}],
         "background": "#7fb6d6", "backdrop": "waves", "transition": "wipe",
         "characters": {"host": {"x": .5, "scale": .8}},
         "items": [{"svg": ship(9), "x": .2, "y": .36, "w": .3, "at": .4, "loop": "bob"},
                   {"svg": ship(0, old=True), "x": .8, "y": .36, "w": .3, "at": 1.8, "enter": "draw", "loop": "bob"},
                   {"text": "?", "x": .5, "y": .08, "size": .11, "line": 1, "at": .3, "loop": "wobble"}]},
        {"say": [{"who": "guest", "text": "Hmm. Maybe both of them, or neither?"}, {"who": "host", "text": "Philosophers still argue about it. And it is not really about ships."}],
         "background": "#7b6fc4", "backdrop": "stars", "transition": "zoom",
         "characters": {"host": {"x": .2, "scale": .8}, "guest": {"x": .82, "scale": .75}},
         "items": [{"prop": "thought", "x": .52, "y": .3, "w": .14, "line": 0, "at": .4, "loop": "float"}]},
        {"say": [{"who": "host", "text": "Many of the cells in your body are replaced over the years."}, {"who": "host", "text": "So, are you still the same you?"}],
         "background": "#d98aa8", "backdrop": "dots", "particles": "dust", "transition": "iris",
         "characters": {"host": {"x": .5, "scale": .9, "cues": [{"line": 1, "gesture": "shrug", "mood": "curious"}]}},
         "items": [{"prop": "cell", "x": .2, "y": .3, "w": .11, "at": .6, "loop": "float"}, {"prop": "person", "x": .8, "y": .3, "w": .1, "line": 1, "at": .3}]},
    ]})

# ---- 10. Astronomy: no host, Manim orbit ----
finish("astronomy", {
    "title": "Why do we have seasons?",
    "voice": "kokoro:am_adam",
    "scenes": [
        {"say": ["Why do we have seasons? Most people guess it is our distance from the Sun.", "But Earth is actually closest to the Sun in early January."],
         "background": "#1d2a5a", "backdrop": "stars", "particles": "sparkles", "title": "Why seasons?", "titleColor": "#f6f1e6",
         "items": [{"prop": "sun", "x": .26, "y": .66, "w": .18, "at": 1.0, "loop": "spin"},
                   {"prop": "globe", "x": .74, "y": .66, "w": .13, "at": 1.6, "loop": "float"},
                   {"prop": "calendar", "x": .88, "y": .5, "w": .07, "line": 1, "at": .8}]},
        {"say": ["The real reason is a tilt. Earth's axis leans about twenty-three and a half degrees,", "and it keeps pointing the same way all year as we orbit."],
         "background": "#1d2a5a", "backdrop": "stars", "transition": "fade",
         "manim": {"code": "class Orbit(Scene):\n    def construct(self):\n        orbit = Ellipse(width=10, height=4.6, color=GOLD, stroke_opacity=0.6)\n        sun = Circle(0.7, color=GOLD, fill_opacity=1).set_stroke(INK, 4)\n        ball = Circle(0.34, color=BLUE, fill_opacity=1).set_stroke(INK, 3)\n        axis = Line(DOWN*0.6, UP*0.6, color=WHITE, stroke_width=5).rotate(-23.4*DEGREES)\n        earth = VGroup(ball, axis).move_to(orbit.point_from_proportion(0))\n        label = MathTex(r'23.5^\\circ', color=WHITE).scale(1.2).to_corner(UL)\n        self.play(Create(orbit), FadeIn(sun), FadeIn(earth), Write(label), run_time=1.5)\n        self.play(MoveAlongPath(earth, orbit), run_time=7, rate_func=linear)\n"}},
        {"say": ["When your half of Earth leans toward the Sun, sunlight hits it more directly, and days are longer.", "That is summer."],
         "background": "#f2b84b", "backdrop": "grass", "transition": "wipe",
         "items": [{"prop": "sun", "x": .15, "y": .3, "w": .16, "at": .3, "loop": "spin"},
                   {"svg": RAYS("#f6d94a"), "x": .4, "y": .32, "w": .22, "at": 1.0, "enter": "draw"},
                   {"svg": EARTH_TILT, "x": .7, "y": .4, "w": .2, "at": .6, "rotate": -20},
                   {"text": "summer", "x": .7, "y": .78, "size": .08, "line": 1, "mark": "underline", "markColor": "#e2604f"}]},
        {"say": ["Six months later, your half leans away. The light is spread thin, and the days are short.", "Winter."],
         "background": "#5b8fd6", "backdrop": "grass", "particles": "snow", "transition": "push",
         "items": [{"prop": "sun", "x": .15, "y": .3, "w": .16, "at": .3},
                   {"svg": RAYS("#cfe0ea"), "x": .4, "y": .32, "w": .22, "at": 1.0, "enter": "draw"},
                   {"svg": EARTH_TILT, "x": .7, "y": .4, "w": .2, "at": .6, "rotate": 20},
                   {"text": "winter", "x": .7, "y": .78, "size": .08, "line": 1, "mark": "underline", "markColor": "#5b8fd6"}]},
        {"say": ["That is why, when it is summer in London, it is winter in Sydney."],
         "background": "#7b6fc4", "backdrop": "stars", "transition": "iris",
         "items": [{"prop": "globe", "x": .5, "y": .42, "w": .2, "at": .3, "loop": "float"},
                   {"text": "London: summer", "x": .22, "y": .3, "size": .06, "at": 1.4, "color": "#f6f1e6"},
                   {"text": "Sydney: winter", "x": .78, "y": .6, "size": .06, "at": 2.6, "color": "#f6f1e6"}]},
    ]})

# ---- 4, 5, 9. The earlier films, with the end card added ----
for name, base in [("medicine", "_vaccines.base.json"), ("maths", "_pythagoras.base.json"), ("physics", "_sky.base.json")]:
    with open(os.path.join(HERE, base), encoding="utf8") as f:
        spec = json.load(f)
    if name == "physics":
        # The vertical short: waves above the chart, the end card sized for a tall frame.
        items = spec["scenes"][1]["items"]
        items[0]["y"], items[1]["y"], items[2]["y"] = .08, .16, .33
        # A deeper blue, so the tallest bar does not vanish into the blue sky, and the host lower, below the axis.
        items[2]["chart"]["colors"][3] = "#2a4fb8"
        spec["scenes"][1]["character"]["y"] = 1.04
        finish(name, spec, tall=True)
    else:
        finish(name, spec)
