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

- **Local only.** Exports, the corpus, the photo or clip and the avatar stay on your computer. The only network
  use is downloading the pinned MediaPipe files once for face enrolment.
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
- **Video only with a label.** The avatar page records nothing. `selfclone video` makes a video file only under
  the rules in [Video Export](#video-export) below: a burned-in label, a checked consent record, your own audio,
  provenance tags and a length cap.
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
a face on their tutorials), and because a video file leaves the page, where the page's badge cannot follow it. So
the safeguards were built into the video itself, before the feature.

**Why the label is burned in.** Article 50 of the EU AI Act (Regulation (EU) 2024/1689) requires that video which
is artificially generated or manipulated and resembles a real person (a deep fake) be disclosed as such by
whoever publishes it, and that AI-generated video be marked in a machine-readable way. Metadata alone is lost
as soon as a file is re-encoded, trimmed or uploaded to a platform that strips tags, so the disclosure is part of
the picture, and the tags are there as well.

**The safeguards** (each one is covered by tests):

- **A burned-in "AI CLONE" label on every frame**, over the chin, inside the face, so cropping a corner cannot
  remove it: cropping it out means cutting into the face. It stays legible at the smallest size allowed (240 px:
  12 px bold white letters on a near-black chip with a faint white ring). No flag turns it off. Every frame is
  checked for the label before it is encoded, and if one lacks it nothing is written. The page is rebuilt from the
  avatar's data with selfclone's own code, so editing the avatar's HTML does not remove it.
- **A consent check.** Export refuses an avatar with no consent record, with no statement or date, or whose
  record does not match the face in the file (the photo hash differs).
- **Your own audio only.** The only input is an audio file, and there is no text-to-speech, so selfclone never
  puts words in a voice that is not yours. Use only your own recorded voice, or a voice clone of yourself made
  with a tool you are entitled to use. Never someone else's voice.
- **Provenance.** The file carries metadata tags: a comment saying it is an AI clone made with selfclone, the
  consent statement and date, and the selfclone version. A sidecar `<file>.provenance.json` holds the same plus
  SHA-256 hashes of the video and the audio.
- **A length cap.** 10 minutes by default (`--max-minutes`, at most 60): a tool for a tutorial, not for bulk
  generation.
- **Still no puppeteering and no live output.** The video is rendered offline from a file you give it; nothing
  is streamed to a call.

**What this does not stop.** Anyone can blur or paint over a label in a video editor, strip the tags, or film the
screen. The label and the tags make honest use the easy default and dishonest use a deliberate act; they are not
copy protection. Publishing a video with the label removed breaks these rules and, in the EU, the law.

## If You Find Misuse

Open an issue at https://github.com/logitsolutionsai/selfclone/issues. If a clone of you was made without
consent, the person who made it holds the files; selfclone has no server and no copy.
