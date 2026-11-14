# Test Face Fixture

`mona-lisa.jpg` is a 600 x 600 head-and-shoulders crop of a 960 px wide rendering of
"Mona Lisa" by Leonardo da Vinci (painted about 1503 to 1519), downloaded on 2026-11-14.

- File page: https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg
- Image URL used: https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/960px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg
- Licence: public domain. The painting's author died more than 100 years ago, and Wikimedia Commons
  marks faithful reproductions of two-dimensional public domain works as public domain.
- Processing: cropped with ffmpeg (`crop=600:600:180:80`), no other changes.

It is used only as a test face. It is a painting, not a photo of a living person.

# Synthetic Enrol Clip

`mona-lisa-clip.webm` (10 s, 15 frames per second, 512 x 512, VP9, about 200 KB) is synthetic. It was made by
`make-clip.mjs` in this folder: the painting above is baked into a photo avatar, which then reads the enrol
phrase ("Ah, I see. Oh, why would you move a big cheap boat? Five fast vans.") slowly (0.74 of the normal rate,
about 0.6 to 8 s) and blinks twice (about 8.5 and 9.2 s) in headless Chrome under a paused fake clock, and
ffmpeg encodes the frames. No real person was filmed. It was last recorded on 2026-11-14 with the current drawn
mouth (dim teeth, small rounded O and U).

Why synthetic: the project never uses video or photos of a living person, and there is no public domain
video of a real face reading this phrase. The clip proves that the clip pipeline (decoding, landmarks on every
frame, keyframe selection, alignment, patches, rendering) works end to end. It does not prove that the clip
path looks better than the drawn mouth, because its "real" open mouths and closed eyes are the drawn mouth and
the drawn blink of the photo avatar.

What the landmarker sees in it: the drawn O and U clearly (mouthPucker up to 1.0, a narrow mouth), and the
drawn AA and E as nearly closed (jawOpen at most 0.07, a lip gap at most 0.15 of the mouth width, no smile or
stretch). So keyframe selection finds O, U and the blink, and the baked avatar draws AA, E, M B P and F V with
the drawn mouth. Reading more slowly, or holding every vowel three times as long, gave the same result: the
drawn open mouth is too subtle for the landmarker to call open, which is itself a sign that it is not a real
mouth. The browser tests therefore check the patch path with O.

`mona-lisa-clip-frames.json` is a recording of what the face landmarker measured on every frame of that clip
(blendshapes, head pose, mouth sharpness and the landmarks keyframe selection reads), made by
`record-clip-frames.mjs`. The unit tests run keyframe selection on it without a browser.

Regenerate both, in this order, after changing the drawn mouth or the phrase:

```bash
node tests/fixtures/make-clip.mjs
node tests/fixtures/record-clip-frames.mjs
```
