# Supported Export Formats

`selfclone ingest` takes files, folders and `.zip` files, detects the format of each, and keeps only the
messages written by the person named with `--me`. For every one of those messages it also keeps the message
someone else sent just before (the context), because a reply to a real message is what the clone is tested on.

Pass several inputs at once, for example `selfclone ingest chat.zip slack-export/ notes/ --me "Ada Lovelace,ada"`.
A folder can hold the export `.zip` files as they were downloaded; they are opened too. Files that macOS and
Windows add when zipping (`__MACOSX/`, `._*`, `.DS_Store`, `Thumbs.db`) are ignored.
`--me` is a comma-separated list of names, handles or user ids. If nothing matches, ingest lists the authors it
found. Force a format with
`--format whatsapp|telegram|slack|x|mbox|text|jsonl|csv|discord|instagram|messenger|linkedin|imessage|reddit|googlechat|docx|blog`
when detection guesses wrong.

Each kept message records its `source` (the format name above). Exports that hold only your own writing
(the Discord data package, Reddit, Word, blog posts, notes and X) have no other people in them, so their
messages shape the voice but are sealed only where a reply has its own context.

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

## Discord

There are two kinds of Discord export, and both work.

**DiscordChatExporter (best for the test).** The open-source DiscordChatExporter tool exports a channel, a
thread or a DM with everyone's messages. Choose the JSON format. Use it only on conversations you are part of,
and follow Discord's terms. You get one `.json` file per channel.

**What is parsed:** `guild`, `channel` and `messages`, each message with `author` (`id`, `name`, `nickname`,
`isBot`), `type`, `timestamp`, `content` and `reference.messageId`. Only `Default` and `Reply` messages are
kept; joins, pins, calls, thread notices and bots are skipped, and so are messages with only an attachment or a
sticker. A reply gets the exact message it answered as context. `--me` can be your username, your server
nickname, `username#1234` or your user id.

**Discord's own data package.** User Settings, Data and Privacy, Request all of my Data. Discord emails a link
to a `.zip`. Pass the `.zip` or the unzipped folder.

**What is parsed:** `Messages/c<channel id>/messages.json` (newer packages: an array of `{ID, Timestamp,
Contents, Attachments}`) or `messages.csv` (older packages: the same four columns), with `channel.json` beside
it and `Messages/index.json` for channel names. The package holds only messages you sent, with no author field
and no one else's messages, so every message is yours, none has context, and none is sealed: the package
shapes the voice but cannot be tested. Timestamps such as `2023-12-22 07:14:15` are read as UTC. Discord
documents the four fields in its support article "Your Discord Data Package"; the folder layout above is the
one described by Discord and by open-source parsers of the package in 2025 and 2026 (older packages leave out
the `c` before the channel id, which also works).

## Instagram And Facebook Messenger

**How to export:** Accounts Center, Your information and permissions, Download your information, choose the
account and Messages, format **JSON** (not HTML), media quality low. You get one or more `.zip` files. Pass
them as they are, or the unzipped folder.

**What is parsed:** every `message_1.json`, `message_2.json` and so on, in the older `messages/inbox/<chat>/`
layout and the newer `your_instagram_activity/messages/inbox/<chat>/` and
`your_facebook_activity/messages/inbox/<chat>/` layouts (also `archived_threads`, `message_requests` and the
other folders). The files of one chat are read together and put in time order, because Meta lists the newest
message first. Meta writes every non-ASCII character as its UTF-8 bytes, each escaped separately (`cafÃ©` for
`café`, four odd characters for one emoji); names and text are decoded back, and a string that is not valid
UTF-8 that way is left as it is. Lines Meta writes itself are skipped: "sent an attachment", reactions and
likes, "unsent a message", calls, group notices, shares that are only a link, and messages of type `Share`,
`Call`, `Subscribe` or `Unsubscribe`. Messenger's download of end-to-end encrypted chats, which writes
camelCase fields (`senderName`, `timestamp`, `text`, `isUnsent`), is read too; that shape was not checked
against a real download. The HTML version of the export is not supported: download JSON.

**Your name:** Meta writes your messages under your profile name. Use that with `--me`. The source is
`instagram` when the folder or `.zip` name says Instagram and `messenger` when it says Facebook or Messenger;
otherwise Facebook-only fields decide. Force it with `--format instagram` or `--format messenger`.

## LinkedIn

**How to export:** Settings, Data privacy, Get a copy of your data, choose Messages (or the full archive).
LinkedIn emails a link to a `.zip` holding `messages.csv`.

**What is parsed:** `messages.csv` with the columns `CONVERSATION ID`, `FROM`, `SENDER PROFILE URL`, `DATE`,
`CONTENT` and `FOLDER` (other columns are ignored). HTML in `CONTENT` is converted to text, rows in the
`SPAM` folder and unsent drafts (`IS MESSAGE DRAFT` true) are skipped, and each conversation is put in time
order. `--me` is your name as LinkedIn shows it, or your profile URL.

## iMessage

**How to export:** on a Mac, install the open-source `imessage-exporter` tool and run
`imessage-exporter -f txt -o imessage_export`. You get one `.txt` file per conversation. Pass the folder.

**What is parsed:** the tool's TXT layout: a timestamp line (`May 17, 2022  5:29:42 PM`, with an optional
read receipt in parentheses), a sender line, the message lines and a blank line. Your own messages are those
written by `Me`, so `--me` can be left out. Attachment paths, the deleted-message notice, expressive notes
("Sent with Confetti"), location sharing, FaceTime and SharePlay lines and
the tapback list under a message are skipped; for a translated message the original text is kept. Replies that
the tool prints indented under their parent are read as messages too. The layout was checked against the
expected output in the tool's own tests; tapback lines are skipped by a best guess at their layout.

## Reddit

**How to export:** reddit.com/settings/data-request on a computer, request your data. Reddit emails a link to
a `.zip` holding `comments.csv` and `posts.csv`, among other files.

**What is parsed:** columns are found by name: `id`, `date`, `subreddit`, `body` and `parent` in
`comments.csv`; `id`, `date`, `subreddit`, `title` and `body` in `posts.csv`. Every row is yours. A post is its
title and its text. `[deleted]` and `[removed]` rows are skipped, Markdown links keep their text, and quoted
lines (`> ...`) are removed because they quote someone else. The export does not contain other people's
comments, so a comment gets context only when its parent is one of your own posts or comments in the same
export.

## Google Chat

**How to export:** Google Takeout, select Google Chat. You get `Takeout/Google Chat/Groups/<space or DM>/`
folders, each with `messages.json` and `group_info.json`, and `Takeout/Google Chat/Users/User <id>/user_info.json`.

**What is parsed:** each message's `creator` (`name`, `email`, `user_type`), `created_date` (for example
`Tuesday, March 14, 2023 at 10:22:01 AM UTC`) and `text`. Bots and messages with only an attachment are
skipped. `user_info.json` names the account owner, so `--me` can be left out when it is in the export;
otherwise use your name or your email address.

## Word Documents

**How to export:** any `.docx` you wrote. Save older `.doc` files as `.docx` first.

**What is parsed:** the paragraphs of `word/document.xml`, read with the built-in ZIP reader. Tabs and line
breaks are kept, headings (Title, Subtitle and Heading styles), deleted tracked changes and field codes are
left out, and headers, footers, footnotes and comments are not read. Everything is treated as written by you,
like notes, so it shapes the voice but is never sealed.

## Blog Posts

**How to export:** save your posts as HTML pages, or download your blog's RSS or Atom feed (often `/feed`,
`/rss.xml` or `/atom.xml`) and save it as a `.xml`, `.rss` or `.atom` file. Most blog platforms also offer an
export that includes a feed file.

**What is parsed:** for an HTML page, the `<article>` (else `<main>`, else the body), without navigation,
headers, footers, forms, scripts, styles, code blocks or headings; every paragraph and list item becomes a
message. For a feed, every item or entry: the full content (`content:encoded` or Atom `content`) when present,
otherwise the description or summary, escaped HTML and CDATA included, with its publication date. Everything
is treated as written by you, like notes. An HTML page passed on its own is always read; inside a folder or a
`.zip`, a page is read only when it is marked up as an article (an `<article>` element or `og:type` article),
so the pages that other exports carry (the X archive viewer, the Takeout index, Meta's HTML export) are never
taken as your posts.

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
