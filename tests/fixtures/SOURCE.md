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

`mona-lisa-clip.webm` (10 s, 15 frames per second, 512 x 512, VP9, about 190 KB) is synthetic. It was made by
`make-clip.mjs` in this folder: the painting above is baked into a photo avatar, which then reads the enrol
phrase ("Ah, I see. Oh, why would you move a big cheap boat? Five fast vans.") at half speed and blinks twice
in headless Chrome under a fake clock, and ffmpeg encodes the frames. No real person was filmed.

Why synthetic: the project never uses video or photos of a living person, and there is no public domain
video of a real face reading this phrase. The clip proves that the clip pipeline (decoding, landmarks on every
frame, keyframe selection, alignment, patches, rendering) works end to end. It does not prove that the clip
path looks better than the drawn mouth, because its "real" open mouths and closed eyes are the drawn mouth and
the drawn blink of the photo avatar. MediaPipe also reads that drawn mouth as only slightly open (jawOpen
stays under 0.1), which is itself a sign of how unconvincing the drawn mouth is.

`mona-lisa-clip-frames.json` is a recording of what the face landmarker measured on every frame of that clip
(blendshapes, head pose, mouth sharpness and the landmarks keyframe selection reads), made by
`record-clip-frames.mjs`. The unit tests run keyframe selection on it without a browser.

Regenerate both, in this order, after changing the drawn mouth or the phrase:

```bash
node tests/fixtures/make-clip.mjs
node tests/fixtures/record-clip-frames.mjs
```
