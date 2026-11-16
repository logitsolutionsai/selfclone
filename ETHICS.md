# Ethics

selfclone makes a convincing copy of how a person writes and a talking version of their face. That is useful
(drafting in your own voice, leaving a record of how you write, having fun with friends) and it can be misused
(impersonation, harassment, fraud). These are the rules the project is built around, and the defaults that
enforce them.

## Who May Be Cloned

- **Yourself.** This is the main use.
- **Someone who gave you written consent**, for this purpose, that you can show. Keep it. Put it in the clone.
- **Not** a public figure from private messages, a minor, a partner or former partner, a colleague, or anyone
  else who has not agreed. Not a person who has died unless you are their legal representative and the use
  fits their wishes.

The skill asks about consent before it ingests anything and refuses the cases above.

## What The Clone Must Always Do

- Say it is an AI clone whenever anyone asks. The generated skill has this as its first rule.
- Never claim to be the real person to someone who does not know.
- Never act for the person in anything binding: payments, contracts, legal or medical decisions, or apologies
  to real people about real events.
- Never invent facts about the person's life. Opinions in the clone cite real messages as evidence.

## Built-In Safeguards

- **Local only.** Exports, the corpus, the photo or clip and the avatar stay on your computer. The network is
  used to download the pinned MediaPipe files once for face enrolment and, for explainer videos, the Kokoro
  voice model once. Narration text is sent out only if you choose a hosted voice (ElevenLabs or OpenAI).
- **The enrolment clip is processed in memory and never stored.** The webcam clip is read frame by frame and
  is not recorded to a file; `selfclone bake --video` reads your file and copies it nowhere. Only one still
  frame and a few small patches of your own mouth and eyes (tens of kilobytes) are baked into the avatar. Frames
  with another face in them are dropped, and a clip where another face appears often is refused.
- **Secrets scrubber on by default.** API keys, passwords, PINs and door codes, card numbers, IBANs, bank
  account and social security numbers, emails, phone numbers and token URLs are replaced with placeholders
  before anything is stored. It matches patterns, so read the pack before you share anything built from it.
- **Consent record in the avatar.** Name, statement, date, method (photo, webcam frame, webcam clip or video
  file), what was kept from a clip, and a hash of the photo are embedded and shown in the "About this clone"
  panel. The badge also records whether the face came from a photo or a clip.
- **Always-visible "AI CLONE" badge.** It cannot be switched off in the page, and the face stops rendering if the
  badge is removed or hidden. This is a default, not a lock: anyone can edit an HTML file.
- **Video only under rules.** The avatar page records nothing. `selfclone video` makes a video file only under
  the rules in [Video Export](#video-export) below: a checked consent record, your own audio and a length cap.
- **No puppeteering.** The face is driven only by text or audio. It cannot be driven by anyone's webcam, so it
  cannot be used as a live deepfake of the person in a video call.
- **The face is not photoreal.** It is one frame warped in 2D, with a drawn mouth interior or, after a clip,
  small flat patches of the person's own mouth and eyes. It is easy to tell apart from video of the person, by
  design: no generative video model, no deep learning beyond the landmark detector used once at enrolment.
- **Honest scoring.** The fidelity score is computed by counting, on messages the clone never saw, and the
  report says what it does not measure.

## Video Export

**What changed.** selfclone used to have no video export at all. It now has one, `selfclone video`: the avatar
rendered into a video file, lip-synced to a recording of your own voice, to sit in a corner of a screen recording
or tutorial as a picture-in-picture presenter, a face on camera without the camera. The owner decided to allow it
because it is an ordinary, useful thing to want (people who do not want to be on camera, or cannot be, still want
a face on their tutorials).

**Disclosure is the publisher's job.** The video has no visible label and no AI tags in its metadata. Article 50 of
the EU AI Act (Regulation (EU) 2024/1689) requires whoever publishes video that is artificially generated or
manipulated and resembles a real person (a deep fake) to disclose it as such. If that is you, say so where you
publish it.

**The safeguards** (each one is covered by tests):

- **A consent check.** Export refuses an avatar with no consent record, with no statement or date, or whose
  record does not match the face in the file (the photo hash differs).
- **Your own audio only.** The only input is an audio file, and there is no text-to-speech, so selfclone never
  puts words in a voice that is not yours. Use only your own recorded voice, or a voice clone of yourself made
  with a tool you are entitled to use. Never someone else's voice.
- **A length cap.** 10 minutes by default (`--max-minutes`, at most 60): a tool for a tutorial, not for bulk
  generation.
- **Still no puppeteering and no live output.** The video is rendered offline from a file you give it; nothing
  is streamed to a call.

**What this does not stop.** The consent check and the audio-only input make honest use the easy default; they are
not copy protection. Anyone can edit the output in a video editor.

## Explainer Videos (Studio)

**What it is.** `selfclone explainer` makes short animated explainers with a synthetic voice reading a script. The
people on screen are drawings: SVG characters drawn from a seed (random, fictional) or, with consent, a caricature
whose proportions and colours come from your face photo. No image or video model is used, and nothing looks like
footage of a real person. Studio videos carry no visible label and no AI tags, like any animated explainer.

**The rules:**

- **Consent for a real face.** `selfclone character --photo` refuses without a consent statement, which is stored in
  the character. Same rule as the face: yourself, or a person whose written consent
  you hold.
- **Random characters are fictional.** A random character is drawn from a seed and is nobody's likeness; never
  present one as a real person.
- **Voices.** The default is a stock Kokoro voice, which is nobody's voice. A voice clone (an ElevenLabs voice,
  say) must be your own or one whose owner gave written consent; the providers' own terms require it too.
- **Do not put words in a real person's mouth** that they did not say or agree to, and do not present an
  explainer as a statement by a real person. Where a platform asks you to disclose synthetic or altered content,
  say that the narration is synthetic.
- **Scene drawings cannot run code, but Manim code can.** Scene SVG with scripts, event handlers, images or external
  links is refused, and the render page has the network blocked. A Manim block runs as Python on your computer, so
  render only scene files you wrote or trust.

## If You Find Misuse

Open an issue at https://github.com/logitsolutionsai/selfclone/issues. If a clone of you was made without
consent, the person who made it holds the files; selfclone has no server and no copy.
