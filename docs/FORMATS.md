# Supported Export Formats

`selfclone ingest` takes files, folders and `.zip` files, detects the format of each, and keeps only the
messages written by the person named with `--me`. For every one of those messages it also keeps the message
someone else sent just before (the context), because a reply to a real message is what the clone is tested on.

Pass several inputs at once, for example `selfclone ingest chat.zip slack-export/ notes/ --me "Ada Lovelace,ada"`.
A folder can hold the export `.zip` files as they were downloaded; they are opened too. Files that macOS and
Windows add when zipping (`__MACOSX/`, `._*`, `.DS_Store`, `Thumbs.db`) are ignored.
`--me` is a comma-separated list of names, handles or user ids. If nothing matches, ingest lists the authors it
found. Force a format with `--format whatsapp|telegram|slack|x|mbox|text|jsonl|csv` when detection guesses wrong.

## WhatsApp

**How to export:** open the chat, then Android: More, Export chat, Without media. iPhone: tap the contact or
group name, Export Chat, Without Media. You get a `.txt` file, or a `.zip` with `_chat.txt` inside. Both work.

**What is parsed:** Android lines (`12/31/23, 9:41 PM - Name: text`) and iOS lines (`[31/12/2023, 21:41:07] Name: text`),
day-first and month-first dates, 12 and 24 hour times, narrow no-break spaces before AM or PM, and multi-line
messages. The date order comes from any day above 12 in the file; when every day and month is 12 or less, the
reading that keeps the messages in time order wins. System lines, "Media omitted", "image omitted", attachments
(a caption under an attachment is kept), locations, polls, deleted messages and missed calls are skipped. On
iOS, every line WhatsApp writes itself starts with an invisible left-to-right mark; those lines are skipped,
including group notices that iOS files under the group's name. Android group notices that quote a name or a
subject containing a colon (`Ana changed the subject from "Sail: Sat" to "Sail: Sun"`) are recognised as
notices, and a contact saved with a colon in the name (`Dr. Lee: Lab`) keeps the whole name. People who are
not in your contacts (`~ Name` on iOS) lose the `~`. The trailing "This message was edited" note is removed.

**Your name:** WhatsApp writes your own messages under your profile name. Use that with `--me`. A name that
contains a comma, such as `"Vidal, Rosa"`, matches as a whole too.

## Telegram

**How to export:** Telegram Desktop, Settings, Advanced, Export Telegram data, choose Personal chats (and
groups if you want them), format "Machine-readable JSON". Or open one chat, the three-dot menu, Export chat
history, format JSON. You get `result.json`.

**What is parsed:** a single chat export or a full account export. Rich text arrays are flattened. Replies use
`reply_to_message_id`, so the context is the exact message you answered. Service messages and media without
text are skipped. Messages you forwarded (and inline-bot results) are not your writing: they are never learned
as your style, but they can be the context of what you wrote next. In a full export your own account is recognised from `personal_information`, so `--me` can be
left out.

## Slack

**How to export:** a workspace admin exports from Settings and administration, Workspace settings, Import and
export data, Export. You get a `.zip` with `users.json`, `channels.json` and one folder per channel holding
`YYYY-MM-DD.json` files. Pass the `.zip` or the unzipped folder.

**What is parsed:** messages per channel in time order; thread replies get the thread parent and earlier
replies as context. User mentions become `@name`, channel links become `#channel`, links keep the URL, and
`&amp;` style escapes are decoded, and common emoji shortcodes (`:joy:`, `:+1::skin-tone-3:`) become the emoji
people saw; unknown custom emoji stay as text. Joins, leaves, topic changes, huddles, bot messages and messages
from app users (`is_bot` in `users.json`) are skipped. `--me` can be your user id (`U01ABC`), handle, display
name or real name.

## X (Twitter)

**How to export:** Settings and privacy, Your account, Download an archive of your data. You get a `.zip`.
Pass the `.zip`, the unzipped folder, or `data/tweets.js` on its own.

**What is parsed:** every tweet in the archive is yours, so `--me` is only used as a label. Retweets are
skipped, `t.co` links are expanded, and the automatic `@mentions` at the start of replies are removed. A reply
to one of your own tweets (a thread) gets the earlier tweet as context. Replies to other people have no context,
because the archive does not contain their tweets, so they are used for training but not for the sealed test.

## Email (Mbox And Eml)

**How to export:** Gmail: Google Takeout, select Mail, you get an `.mbox` file. Thunderbird: the ImportExportTools
NG add-on exports folders as `.mbox`. Apple Mail: select a mailbox, Mailbox menu, Export Mailbox. Single
messages saved as `.eml` also work.

**What is parsed:** messages sent by you (the `From:` header matches `--me`, which can be your address).
The plain-text part is preferred, HTML is converted to text (entities decoded, line breaks in the HTML source
ignored), quoted-printable and base64 are decoded, and encoded headers are decoded. Quoted replies (`>` lines,
"On ... wrote:" blocks also in Portuguese, Spanish, French, German, Italian, Dutch and Scandinavian forms,
Outlook "Original Message" blocks), signatures after `-- ` and "Sent from my phone" footers (also "Enviado do
meu iPhone" and similar) are removed from your text. A signature without `-- ` is removed when the same lines
end two or more of your mails; the sign-off line ("Best,") and the short name under it are kept, because they
are how you write. Body lines that start with "From " are not mistaken for the start of a new mail, and the
`>From ` escaping of mboxrd files is undone. The context is the message you replied to (found by `In-Reply-To`
when it is in the file) or else the quoted text in your reply.

**Size:** the whole file is read into memory. Very large Takeout files (over about 500 MB) should be split by label first.

## Notes (Plain Text And Markdown)

**How to export:** any `.txt` or `.md` files you wrote: journals, drafts, blog posts, notes exported from your
notes app.

**What is parsed:** everything is treated as written by you. Text is split into paragraphs at blank lines.
For Markdown, front matter, code blocks, images and heading and list markers are removed and links keep their
text. Paragraphs longer than 2,000 characters are split at sentence ends. Notes have no context, so they shape
the voice but are never sealed.

## Generic JSONL And CSV

For any other app, convert to JSONL (one JSON object per line) or CSV with a header row. Recognised columns,
case-insensitive:

| Meaning | Accepted names |
| --- | --- |
| Author | `author`, `from`, `sender`, `user`, `username`, `user_name`, `name`, `speaker` |
| Text | `text`, `message`, `body`, `content`, `msg` |
| Time | `ts`, `timestamp`, `date`, `time`, `datetime`, `created_at`, `sent_at` (ISO dates or Unix seconds or milliseconds) |
| Conversation | `thread`, `conversation`, `chat`, `channel`, `thread_id`, `conversation_id`, `chat_id` |
| Context | `context`, `prompt`, `in_reply_to_text`, `reply_to_text` (optional; otherwise the previous message by someone else is used) |

CSV follows RFC 4180: quoted fields, doubled quotes and line breaks inside quotes work. Tab-separated files are
detected from the header line. A `.json` file holding an array of such objects also works.

## What Ingest Writes

| File | Content |
| --- | --- |
| `corpus.jsonl` | every kept message: `{id, ts, source, author, text, context, turn, thread}` |
| `train.jsonl` | the messages used for the fingerprint, the pack and the score baseline |
| `sealed.jsonl` | the sealed test pairs: `{id, turn, source, ts, context, reply, ids}` |
| `split.json` | seed, counts and a SHA-256 of the sealed set, checked again at scoring time |
| `ingest.json` | inputs, per-format counts and scrubber counts |

A turn is one reply: consecutive messages you sent within five minutes of each other count as one turn, and
only the first carries the context. Whole turns go to one side of the split. A message more than 24 hours after
the other person's last message gets no context.
