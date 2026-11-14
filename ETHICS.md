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
- **No video export.** The avatar has no recording or export feature.
- **No puppeteering.** The face is driven only by text or audio. It cannot be driven by anyone's webcam, so it
  cannot be used as a live deepfake of the person in a video call.
- **The face is not photoreal.** It is one frame warped in 2D, with a drawn mouth interior or, after a clip,
  small flat patches of the person's own mouth and eyes. It is easy to tell apart from video of the person, by
  design: no video synthesis, no deep learning beyond the landmark detector used once at enrolment.
- **Honest scoring.** The fidelity score is computed by counting, on messages the clone never saw, and the
  report says what it does not measure.

## If You Find Misuse

Open an issue at https://github.com/logitsolutionsai/selfclone/issues. If a clone of you was made without
consent, the person who made it holds the files; selfclone has no server and no copy.
