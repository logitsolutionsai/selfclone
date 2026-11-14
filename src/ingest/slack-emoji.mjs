// The most used Slack emoji shortcodes, mapped to the emoji the reader saw.
// Slack exports keep ":joy:" as text; without this, a Slack-heavy writer would look
// like someone who types colons and words instead of emoji. Unknown codes stay as they are.
const LIST = `
joy 😂|rofl 🤣|sweat_smile 😅|smile 😄|smiley 😃|grinning 😀|grin 😁|laughing 😆|satisfied 😆|slightly_smiling_face 🙂|
upside_down_face 🙃|wink 😉|blush 😊|innocent 😇|heart_eyes 😍|kissing_heart 😘|yum 😋|stuck_out_tongue 😛|
stuck_out_tongue_winking_eye 😜|sunglasses 😎|thinking_face 🤔|thinking 🤔|neutral_face 😐|expressionless 😑|
no_mouth 😶|smirk 😏|unamused 😒|face_with_rolling_eyes 🙄|eyes 👀|grimacing 😬|relieved 😌|pensive 😔|
sleepy 😪|sleeping 😴|mask 😷|nerd_face 🤓|confused 😕|worried 😟|slightly_frowning_face 🙁|open_mouth 😮|
astonished 😲|flushed 😳|pleading_face 🥺|cry 😢|sob 😭|scream 😱|disappointed 😞|sweat 😓|weary 😩|
tired_face 😫|triumph 😤|rage 😡|angry 😠|exploding_head 🤯|partying_face 🥳|star-struck 🤩|melting_face 🫠|
saluting_face 🫡|skull 💀|clown_face 🤡|ghost 👻|robot_face 🤖|see_no_evil 🙈|facepalm 🤦|face_palm 🤦|
shrug 🤷|man-shrugging 🤷‍♂️|woman-shrugging 🤷‍♀️|raised_hands 🙌|clap 👏|wave 👋|+1 👍|thumbsup 👍|-1 👎|
thumbsdown 👎|ok_hand 👌|pray 🙏|muscle 💪|point_up 👆|point_down 👇|point_left 👈|point_right 👉|
crossed_fingers 🤞|v ✌️|metal 🤘|handshake 🤝|writing_hand ✍️|heart ❤️|red_heart ❤️|orange_heart 🧡|
yellow_heart 💛|green_heart 💚|blue_heart 💙|purple_heart 💜|black_heart 🖤|broken_heart 💔|two_hearts 💕|
sparkling_heart 💖|heartpulse 💗|sparkles ✨|star ⭐|star2 🌟|fire 🔥|100 💯|boom 💥|tada 🎉|confetti_ball 🎊|
balloon 🎈|gift 🎁|trophy 🏆|medal 🏅|rocket 🚀|zap ⚡|rainbow 🌈|sunny ☀️|cloud ☁️|umbrella ☔|snowflake ❄️|
ocean 🌊|droplet 💧|coffee ☕|tea 🍵|beer 🍺|beers 🍻|wine_glass 🍷|clinking_glasses 🥂|pizza 🍕|taco 🌮|
cake 🍰|birthday 🎂|cookie 🍪|doughnut 🍩|avocado 🥑|bread 🍞|bike 🚲|bicycle 🚲|car 🚗|airplane ✈️|
boat ⛵|sailboat ⛵|house 🏠|computer 💻|iphone 📱|phone ☎️|email 📧|memo 📝|pencil2 ✏️|bulb 💡|
calendar 📅|date 📅|clock3 🕒|hourglass ⌛|lock 🔒|key 🔑|moneybag 💰|chart_with_upwards_trend 📈|
white_check_mark ✅|heavy_check_mark ✔️|ballot_box_with_check ☑️|x ❌|warning ⚠️|question ❓|exclamation ❗|
bangbang ‼️|no_entry 🚫|rotating_light 🚨|bell 🔔|speech_balloon 💬|dog 🐶|cat 🐱|unicorn_face 🦄|
see_no_evil_monkey 🙈|seedling 🌱|herb 🌿|sunflower 🌻|rose 🌹|cactus 🌵|palm_tree 🌴|earth_africa 🌍|
dart 🎯|soccer ⚽|basketball 🏀|musical_note 🎵|headphones 🎧|camera 📷|tv 📺|books 📚|book 📖|
hugging_face 🤗|hugs 🤗|zany_face 🤪|money_mouth_face 🤑|nauseated_face 🤢|face_with_monocle 🧐|
hand ✋|raised_hand ✋|raising_hand 🙋|bow 🙇|person_bowing 🙇|dancer 💃|man_dancing 🕺|ninja 🥷`;

const MAP = new Map(
  LIST.split('|').map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(' ');
    return [s.slice(0, i), s.slice(i + 1)];
  })
);
const TONES = { 'skin-tone-2': '\u{1F3FB}', 'skin-tone-3': '\u{1F3FC}', 'skin-tone-4': '\u{1F3FD}', 'skin-tone-5': '\u{1F3FE}', 'skin-tone-6': '\u{1F3FF}' };

export function slackEmoji(text) {
  return String(text).replace(/:([a-z0-9_+-]+):(?::(skin-tone-[2-6]):)?/g, (m, code, tone) => {
    const e = MAP.get(code);
    return e ? e + (tone ? TONES[tone] : '') : m;
  });
}
