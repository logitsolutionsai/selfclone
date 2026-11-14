import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrub, luhnValid, ibanValid } from '../../src/scrub.mjs';

const s = (t) => scrub(t).text;

test('scrubs API keys of common formats', () => {
  assert.equal(s('key is sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx'), 'key is [API_KEY]');
  assert.equal(s('openai sk-proj-1234567890abcdefGHIJ'), 'openai [API_KEY]');
  assert.equal(s('aws AKIAIOSFODNN7EXAMPLE ok'), 'aws [API_KEY] ok');
  assert.equal(s('token ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8 here'), 'token [API_KEY] here');
  assert.equal(s('github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuv'), '[API_KEY]');
  assert.equal(s('slack xoxb-123456789012-abcdefghijkl'), 'slack [API_KEY]');
  assert.equal(s('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'), 'jwt [TOKEN]');
});

test('scrubs generic high-entropy tokens but keeps long words and slugs', () => {
  assert.equal(s('use Zx9Qw7Er5Ty3Ui1Op0As8Df6Gh4Jk2L'), 'use [SECRET]');
  assert.equal(s('antidisestablishmentarianism is long'), 'antidisestablishmentarianism is long');
  assert.equal(s('see the-quick-brown-fox-jumps-over-dogs'), 'see the-quick-brown-fox-jumps-over-dogs');
  assert.equal(s('#ThrowbackThursdayVibesForever'), '#ThrowbackThursdayVibesForever');
});

test('does not treat ordinary words as keys', () => {
  assert.equal(s('I will skip-the-line and ask Sky'), 'I will skip-the-line and ask Sky');
  assert.equal(s('task-list for the week'), 'task-list for the week');
});

test('scrubs password lines and keeps normal talk about passwords', () => {
  assert.equal(s('password: hunter22'), 'password: [PASSWORD]');
  assert.equal(s('the wifi password is CoffeeTime99'), 'the wifi password is [PASSWORD]');
  assert.equal(s('pw = "s3cr3t!"'), 'pw = "[PASSWORD]"');
  assert.equal(s('I forgot my password lol'), 'I forgot my password lol');
  assert.equal(s('the password is in the drawer'), 'the password is in the drawer');
  assert.equal(s('my password was wrong again'), 'my password was wrong again');
});

test('scrubs Luhn-valid card numbers only', () => {
  assert.ok(luhnValid('4111111111111111'));
  assert.ok(!luhnValid('4111111111111112'));
  assert.equal(s('card 4111 1111 1111 1111 thanks'), 'card [CARD] thanks');
  assert.equal(s('card 4111-1111-1111-1111'), 'card [CARD]');
  assert.equal(s('order 4111 1111 1111 1112 shipped'), 'order 4111 1111 1111 1112 shipped');
});

test('scrubs valid IBANs only', () => {
  assert.ok(ibanValid('GB82 WEST 1234 5698 7654 32'));
  assert.ok(!ibanValid('GB82 WEST 1234 5698 7654 33'));
  assert.equal(s('pay to GB82 WEST 1234 5698 7654 32 pls'), 'pay to [IBAN] pls');
  assert.equal(s('send DE89370400440532013000'), 'send [IBAN]');
  assert.equal(s('ref GB82 WEST 1234 5698 7654 33'), 'ref GB82 WEST 1234 5698 7654 33');
});

test('scrubs emails and phone numbers', () => {
  assert.equal(s('mail me at jane.doe+x@example.co.uk ok'), 'mail me at [EMAIL] ok');
  assert.equal(s('call +44 7700 900123 later'), 'call [PHONE] later');
  assert.equal(s('call (555) 123-4567'), 'call [PHONE]');
  assert.equal(s('call 555-123-4567 now'), 'call [PHONE] now');
  assert.equal(s('ring 07700 900123'), 'ring [PHONE]');
});

test('leaves dates, times, prices, years and versions alone', () => {
  const keep = [
    'meet on 2024-01-15 at 10:30',
    'it cost $1,299.99 in 2023',
    'version 1.2.3 is out',
    'see you 12/31/2024',
    'room 404, floor 3',
    'the score was 3-2',
    'my number of the day is 42',
  ];
  for (const k of keep) assert.equal(s(k), k);
});

test('scrubs URLs that carry tokens but keeps plain URLs', () => {
  assert.equal(s('open https://x.com/reset?token=abc123 now'), 'open [TOKEN_URL] now');
  assert.equal(s('https://user:pa55@db.example.com/x'), '[TOKEN_URL]');
  assert.equal(s('read https://example.com/blog/post-1?ref=home'), 'read https://example.com/blog/post-1?ref=home');
});

test('scrubs private key blocks and reports counts', () => {
  const r = scrub('x -----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY----- y me@a.io');
  assert.equal(r.text, 'x [PRIVATE_KEY] y [EMAIL]');
  assert.deepEqual(r.counts, { PRIVATE_KEY: 1, EMAIL: 1 });
});

test('handles empty and non-string input', () => {
  assert.equal(s(''), '');
  assert.equal(s(null), '');
  assert.equal(s('héllo wörld 😀'), 'héllo wörld 😀');
});

// Regression tests from the QA pass: phrasings and formats that used to leak, and
// normal text that used to be over-scrubbed.
test('scrubs passwords in more phrasings and languages', () => {
  const cases = [
    ['Password - hunter2', 'Password - [PASSWORD]'],
    ['wifi password BlueWhale2026', 'wifi password [PASSWORD]'],
    ['wifi: BlueWhale2026', 'wifi: [PASSWORD]'],
    ['user rosa pw Sailboat!77', 'user rosa pw [PASSWORD]'],
    ['password for the boat shed is 4471', 'password for the boat shed is [PASSWORD]'],
    ['password is "hunter two"', 'password is "[PASSWORD]"'],
    ['the password is Hunter2.', 'the password is [PASSWORD].'],
    ['senha: Mar2026!', 'senha: [PASSWORD]'],
    ['contraseña: Mar2026!', 'contraseña: [PASSWORD]'],
    ['Passwort: Mar2026!', 'Passwort: [PASSWORD]'],
    ['das Passwort ist Mar2026!', 'das Passwort ist [PASSWORD]'],
    ['mot de passe: Mar2026!', 'mot de passe: [PASSWORD]'],
    ['passphrase: correct horse battery staple', 'passphrase: [PASSWORD]'],
    ['my seed phrase is apple banana cherry dog', 'my seed phrase is [PASSWORD]'],
  ];
  for (const [inp, out] of cases) assert.equal(s(inp), out, inp);
});

test('scrubs door codes, PINs and card security codes', () => {
  assert.equal(s('PIN 4471'), 'PIN [PASSWORD]');
  assert.equal(s('door code 4471# if I am out'), 'door code [PASSWORD] if I am out');
  assert.equal(s('the code for the door is 4471'), 'the code for the door is [PASSWORD]');
  assert.equal(s('cvv 123'), 'cvv [PASSWORD]');
  assert.equal(s('CVC: 123'), 'CVC: [PASSWORD]');
  assert.equal(s('the pin is broken'), 'the pin is broken');
  for (const keep of ['error code 404', 'status code 500', 'zip code 90210', 'the code is on github', 'pin it to the board']) assert.equal(s(keep), keep);
});

test('scrubs phone numbers in national formats of many countries', () => {
  const phones = ['912 345 678', '030 901820', '06 12 34 56 78', '98765 43210', '(11) 91234-5678', '0871234567', '06-12345678', 'call me on 4155550132'];
  for (const p of phones) assert.match(s(p), /\[PHONE\]/, p);
  for (const keep of ['the budget is 100 000 000 euros', 'ip 192.168.100.200', "let's call on 2026-01-15 at 10:00", 'ISBN 978-3-16-148410-0', 'between 1000 and 2000 people']) assert.equal(s(keep), keep);
});

test('scrubs webhook and share links, database URLs, spelled-out emails and US SSNs', () => {
  assert.equal(s('https://hooks.slack.com/services/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'), '[TOKEN_URL]');
  assert.equal(s('postgres://admin:S3cretPass@db.example.com:5432/app'), '[TOKEN_URL]');
  assert.equal(s('https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW/view?usp=sharing'), '[TOKEN_URL]');
  assert.equal(s('rosa (at) example (dot) com'), '[EMAIL]');
  assert.equal(s('my SSN is 078-05-1120'), 'my SSN is [ID_NUMBER]');
  assert.equal(s('sort code 20-00-00 account 55779911'), 'sort code [ACCOUNT] account [ACCOUNT]');
});

test('keeps ordinary URLs whole instead of turning their paths into [SECRET]', () => {
  for (const keep of ['https://example.com/blog/2026/01/sailing-tips', 'read https://medium.com/@rosa/sailing-tips-for-beginners-2026-3f9a1c', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']) assert.equal(s(keep), keep);
});

test('scrubs "password is: x" and keeps the label words intact', () => {
  assert.equal(s('the wifi password is: kilnroom2026'), 'the wifi password is: [PASSWORD]');
  assert.equal(s('Password is:hunter2x'), 'Password is:[PASSWORD]');
  assert.equal(s('pw was -> Sail!77'), 'pw was -> [PASSWORD]');
});
