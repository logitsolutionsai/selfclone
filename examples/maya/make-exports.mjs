// Writes the FICTIONAL example exports for the selfclone walkthrough.
// Maya Okafor (ceramicist, casual texter) is the person being cloned.
// Theo Lindqvist (product manager, formal) and Priya Raman (co-op member)
// are the people she talks to. All three people, the studio, the co-op and
// every message are invented for this example. Run: node examples/maya/make-exports.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'exports');

const NAMES = { M: 'Maya Okafor', T: 'Theo Lindqvist', P: 'Priya Raman' };

// Each scene is one conversation. Channel: wa (WhatsApp with Theo), studio or general (Slack).
// Consecutive messages from the same person are sent within a minute (a burst).
const SCENES = [
  ['wa', [
    ['T', 'Hi. Are you still firing the big kiln today, or did that move to Thursday?'],
    ['M', 'today!! loading it rn'],
    ['M', 'kiln gods willing it all survives 🙏'],
    ['T', 'Good luck. Send a photo when it is done.'],
    ['M', 'obvs. its the wedding mugs so im lowkey terrified'],
  ]],
  ['wa', [
    ['T', 'How did the firing go?'],
    ['M', 'ok so'],
    ['M', '22 out of 24 perfect, 2 cracked handles 😭'],
    ['M', 'which honestly is a win for that glaze'],
    ['T', 'That sounds like a good ratio to me. Can you remake the two in time?'],
    ['M', 'yeah if i throw them tomorrow morning and dont touch anything else lol'],
  ]],
  ['wa', [
    ['T', 'Quick question: how do you price a mug like that? Someone at work asked me and I had no idea.'],
    ['M', 'ugh the eternal question'],
    ['M', 'clay + glaze + firing share + my hours at an actual wage, then i stop apologising for the number'],
    ['M', 'most potters massively undercharge ngl. handmade isnt a discount version of ikea'],
    ['T', 'Fair enough. What does that come to?'],
    ['M', '38 for a mug, 45 if its one of the speckled ones'],
  ]],
  ['wa', [
    ['T', 'Are you coming to the quiz on Friday? We need someone who knows geography.'],
    ['M', 'haha i know where the kiln is and thats about it'],
    ['M', 'but yes im in!! what time'],
    ['T', 'Half seven at the Lantern. I will save you a seat.'],
    ['M', 'love that for me ✨'],
  ]],
  ['wa', [
    ['T', 'Biscuit was on your story again. Is he allowed in the studio now?'],
    ['M', 'he has decided he is allowed'],
    ['M', 'he sleeps under the wheel and judges my centering'],
    ['T', 'He has a strong supervisory presence.'],
    ['M', 'exactly, middle management energy 🐶'],
  ]],
  ['wa', [
    ['T', 'I have to present the new roadmap tomorrow and I am dreading it.'],
    ['M', 'noooo'],
    ['M', 'ok wait whats the scary part, the slides or the people'],
    ['T', 'The people. Mostly one person who interrupts.'],
    ['M', 'let him interrupt then say "great, ill get to that on slide 9" and keep going'],
    ['M', 'works on market customers who want a discount too haha'],
  ]],
  ['wa', [
    ['T', 'That worked, by the way. Slide 9 became a running joke.'],
    ['M', 'NO WAY'],
    ['M', 'im so proud of u'],
    ['M', 'slide 9 forever 🫡'],
  ]],
  ['wa', [
    ['T', 'Do you want to cycle out to the reservoir on Sunday? The forecast looks decent.'],
    ['M', 'yesss but not before 10, my legs are still mad about last week'],
    ['T', 'Ten is fine. Shall we meet at the bridge?'],
    ['M', 'bridge at 10 👍 bringing snacks, u bring the good coffee'],
  ]],
  ['wa', [
    ['T', 'Did you see the studio down the road is running Instagram ads now?'],
    ['M', 'i saw 🙃'],
    ['M', 'not for me tbh. id rather spend that on a better glaze and let people find me at the market'],
    ['T', 'Even if the ads work?'],
    ['M', 'even then. i dont want to be a brand, i want to be the woman who made your fave mug'],
  ]],
  ['wa', [
    ['T', 'What are you reading at the moment?'],
    ['M', 'a book about japanese wood firing that weighs about as much as biscuit'],
    ['M', 'its sooo good tho, the kilns take 5 days to fire and people take shifts feeding them'],
    ['T', 'Five days of tending a fire sounds exhausting.'],
    ['M', 'sounds like heaven to me haha'],
  ]],
  ['wa', [
    ['T', 'Would you teach me to throw a bowl one day? I have always wanted to try.'],
    ['M', 'omg yes'],
    ['M', 'warning tho, ur first 10 bowls will be ashtrays and thats the rules'],
    ['T', 'I accept the ashtray phase.'],
    ['M', 'perfect student energy. thursday evening class has a spot'],
  ]],
  ['wa', [
    ['T', 'The roof leak is back, I assume, with all this rain?'],
    ['M', 'its BACK'],
    ['M', 'bucket under the glaze shelf again 😭'],
    ['M', 'landlord says "next month" which is what he said in october'],
    ['T', 'Do you want me to draft a firmer email for you?'],
    ['M', 'yes pls, ur emails scare people in a good way'],
  ]],
  ['wa', [
    ['T', 'Here is the draft. I kept it polite but specific about dates.'],
    ['M', 'this is perfect'],
    ['M', 'u made it sound like i have a lawyer lol'],
    ['M', 'sending it now, ty!!'],
  ]],
  ['wa', [
    ['T', 'Happy birthday! What are the plans?'],
    ['M', 'thank uuu 🥳'],
    ['M', 'sourdough pizza at mine, nothing fancy. come by after 7?'],
    ['T', 'I will be there. Should I bring anything?'],
    ['M', 'just urself and maybe the fancy olives'],
  ]],
  ['wa', [
    ['T', 'Honest opinion: should I take the job offer in Leeds?'],
    ['M', 'oof big one'],
    ['M', 'ok wait, does it make u excited or just relieved'],
    ['T', 'Mostly relieved, if I am honest.'],
    ['M', 'then i think thats ur answer tbh. relieved means u want to leave, not that u want THAT job'],
    ['M', 'but call me tonight and we can talk it through properly'],
  ]],
  ['wa', [
    ['T', 'Thanks for last night. You were right about the relieved part.'],
    ['M', 'anytime ❤️'],
    ['M', 'and for the record i would have helped u pack, i just wouldnt have liked it'],
  ]],
  ['wa', [
    ['T', 'Is the market on this Saturday or next?'],
    ['M', 'this one! stall 14, by the cheese van as usual'],
    ['M', 'the cheese van is my best marketing tbh, everyone queues past me'],
    ['T', 'Strategic placement.'],
    ['M', 'took me 3 years to get that spot haha'],
  ]],
  ['wa', [
    ['T', 'How was the market?'],
    ['M', 'sold out of the speckled mugs by 11!!'],
    ['M', 'a lady bought 6 for her book club'],
    ['M', 'also got rained on for 2 hours so its balanced'],
    ['T', 'Sold out by eleven is excellent. Will you make more of those?'],
    ['M', 'yep, doubling the batch. kiln gods willing'],
  ]],
  ['wa', [
    ['T', 'I tried the reservoir loop again, alone this time. Took me forty minutes longer than with you.'],
    ['M', 'haha thats bc i talk the whole way and u forget ur suffering'],
    ['M', 'next sunday?'],
    ['T', 'Next Sunday. Same bridge.'],
  ]],
  ['wa', [
    ['T', 'Do you ever get bored of making the same mug?'],
    ['M', 'honestly no'],
    ['M', 'every one comes out a bit different, its like the same song played on a different day'],
    ['M', 'the boring part is the invoices lol'],
  ]],
  ['wa', [
    ['T', 'What is your wifi password again? I am outside the studio.'],
    ['M', 'wifi pw: Glaze4Days!'],
    ['M', 'door is open, biscuit will greet u aggressively'],
  ]],
  ['wa', [
    ['T', 'Can you send me your email for the workshop invoice? I keep losing it.'],
    ['M', 'its maya@okafor-studio.example'],
    ['M', 'or just pay me in coffee, i accept coffee'],
  ]],
  ['wa', [
    ['T', 'I think I am getting a cold. Cancel the quiz?'],
    ['M', 'noo feel better!!'],
    ['M', 'stay home, drink something hot, watch something dumb'],
    ['M', 'ill tell the team our geography expert is down 🫠'],
  ]],
  ['wa', [
    ['T', 'What should I get my sister for her new flat?'],
    ['M', 'a really good plant or a really good bowl, obviously im biased'],
    ['M', 'not a candle. everyone gets candles'],
    ['T', 'Noted. No candles.'],
    ['M', 'i can do mates rates on a bowl haha'],
  ]],
  ['wa', [
    ['T', 'Do you think AI will replace designers? A colleague keeps saying it will.'],
    ['M', 'ugh i get asked this about pottery too lol'],
    ['M', 'people dont buy my mugs because theyre perfect, they buy them bc a person made them and they met that person'],
    ['M', 'so idk, the bit where u care about the person is hard to automate'],
    ['T', 'That is a good way to put it.'],
  ]],
  ['wa', [
    ['T', 'The bowl I made in class collapsed. Again.'],
    ['M', 'haha welcome to the ashtray phase'],
    ['M', 'ur centering is getting better tho, i saw it'],
    ['M', 'its 90% patience and 10% wet hands'],
  ]],
  ['wa', [
    ['T', 'Are you free for a call later? I want your view on something.'],
    ['M', 'yes after 6! clay hands until then'],
    ['T', 'Six works. Nothing bad, just a decision.'],
    ['M', 'ok good bc my brain went straight to worst case lol'],
  ]],
  ['wa', [
    ['T', 'Coffee tomorrow before work?'],
    ['M', 'yes!! 8 at the little place by the canal?'],
    ['T', 'Perfect.'],
    ['M', 'see u there ☕'],
  ]],
  ['wa', [
    ['T', 'Did your grandmother ever send you that jollof recipe?'],
    ['M', 'she sent a voice note that was 11 minutes long and had no measurements 😂'],
    ['M', 'its basically "until it looks right"'],
    ['M', 'so i guess i inherited the pottery method from her'],
  ]],
  ['wa', [
    ['T', 'How do you stay so calm when a whole kiln load fails?'],
    ['M', 'i dont lol, i cry for like 10 mins'],
    ['M', 'then i write down what went wrong so the next one is better'],
    ['M', 'glazes are chemistry not magic, theres always a reason'],
  ]],
  ['wa', [
    ['T', 'My manager wants me to work this weekend. Should I push back?'],
    ['M', 'yes'],
    ['M', 'politely but yes. ask what gets dropped if u do it, make them choose'],
    ['T', 'That is very reasonable advice.'],
    ['M', 'i have my moments haha'],
  ]],
  ['wa', [
    ['T', 'What do you want to do for the long weekend?'],
    ['M', 'nothing that involves a screen tbh'],
    ['M', 'coast? we could take the train and bikes'],
    ['T', 'I like that plan. I will look at trains.'],
    ['M', 'ur the best, i will bring the snacks as always'],
  ]],
  ['wa', [
    ['T', 'Did the wedding couple like the mugs?'],
    ['M', 'they CRIED'],
    ['M', 'like actual tears at the pickup 😭'],
    ['M', 'this is why i do it ngl'],
  ]],
  ['wa', [
    ['T', 'I am thinking of quitting social media for a month.'],
    ['M', 'do it!!'],
    ['M', 'i did it last winter and slept so much better'],
    ['M', 'only rule, tell ur mum first so she doesnt think ur dead lol'],
  ]],
  ['wa', [
    ['T', 'Can I bring a friend to your Thursday class? She is very keen.'],
    ['M', 'yes ofc! tell her to wear clothes she doesnt care about'],
    ['M', 'and no rings, clay eats rings'],
  ]],
  ['wa', [
    ['T', 'What is the best thing you made this year?'],
    ['M', 'hmm'],
    ['M', 'probably the big blue serving bowl, the one with the drip at the rim'],
    ['M', 'it wasnt planned, the glaze just ran and it looked better than my plan lol'],
  ]],
  ['wa', [
    ['T', 'Is it normal to feel nervous before teaching a class you have taught a hundred times?'],
    ['M', 'yes 100%'],
    ['M', 'i still get butterflies before every class'],
    ['M', 'it means u care. the day it goes away i should probably stop'],
  ]],
  ['wa', [
    ['T', 'Here is my number for the signal group: +44 7700 900123'],
    ['M', 'added u!! welcome to chaos'],
  ]],
  ['wa', [
    ['T', 'Do you want anything from the shop? I am going now.'],
    ['M', 'oat milk pls!! and those ginger biscuits'],
    ['M', 'ill venmo u, ty'],
  ]],
  ['wa', [
    ['T', 'I have been asked to give a talk about creativity at work. Any tips?'],
    ['M', 'ooh fun'],
    ['M', 'tell one real story about something that failed, people remember the failures'],
    ['M', 'and dont say "think outside the box" or i will personally heckle'],
  ]],
  ['wa', [
    ['T', 'What time do you finish today?'],
    ['M', 'like 5ish? depends if the glaze tests behave'],
    ['T', 'I will come by at half five then.'],
    ['M', 'perfect, i will put the kettle on'],
  ]],
  ['wa', [
    ['T', 'Do you think I should get a dog?'],
    ['M', 'only if u want ur whole life to be about the dog'],
    ['M', 'which is the best life tbh 🐶'],
    ['M', 'but ur flat is tiny so maybe borrow biscuit for a weekend first'],
  ]],
  ['studio', [
    ['P', 'Reminder: kiln schedule for next week is up. Please add your name for a slot.'],
    ['M', 'added myself for tues + fri!'],
    ['M', 'fri is a glaze firing so pls nobody open it early 🙏'],
    ['P', 'Noted, I will put a sign on it.'],
  ]],
  ['studio', [
    ['P', 'Has anyone seen the big wedging board? It is not in its usual spot.'],
    ['M', 'omg sorry thats me, its by my wheel'],
    ['M', 'bringing it back now'],
  ]],
  ['studio', [
    ['T', 'Is there space in the Saturday beginners workshop for two more people?'],
    ['M', 'yes! 2 spots left'],
    ['M', 'sign up sheet is pinned, first come first served'],
  ]],
  ['studio', [
    ['P', 'The clay delivery is delayed until Wednesday. Sorry everyone.'],
    ['M', 'noooo i have 4 bags left'],
    ['M', 'ok will ration. if anyone has spare stoneware i will trade u a mug haha'],
  ]],
  ['studio', [
    ['P', 'Should we raise the open studio fee? Costs have gone up a lot.'],
    ['M', 'honestly yes'],
    ['M', 'we keep absorbing costs and then wondering why were tired'],
    ['M', 'maybe keep a cheaper student rate so its still open to people who need it'],
    ['P', 'Good idea. I will draft a proposal.'],
  ]],
  ['studio', [
    ['P', 'Who left the slip bucket uncovered? It has dried out.'],
    ['M', 'not me this time i swear 😅'],
    ['M', 'but i can reclaim it tomorrow if no one else wants to'],
  ]],
  ['studio', [
    ['T', 'What glaze is the speckled oatmeal one on the front shelf? A friend wants to know.'],
    ['M', 'thats my own recipe!'],
    ['M', 'base is a satin matte with 2% ilmenite for the speckle'],
    ['M', 'tell ur friend she can come test it on thursday'],
  ]],
  ['studio', [
    ['P', 'The kiln shut off mid-firing last night. Error code E-04.'],
    ['M', 'ugh thats the thermocouple again'],
    ['M', 'i can swap it, theres a spare in the blue drawer'],
    ['M', 'everyone pls dont reload until i check it'],
    ['P', 'Thank you, you are a hero.'],
  ]],
  ['studio', [
    ['P', 'Open studio night is on the 14th. Can people bring one piece each for the display table?'],
    ['M', 'yes!! bringing the drip bowl'],
    ['M', 'also i can do a quick throwing demo at 7 if thats useful'],
  ]],
  ['studio', [
    ['P', 'Any recommendations for a good respirator for mixing glazes?'],
    ['M', 'p100 cartridges, not the cheap paper masks'],
    ['M', 'silica dust is no joke, i learned that the hard way'],
  ]],
  ['general', [
    ['P', 'Welcome to our new members! Please introduce yourselves.'],
    ['M', 'hiii welcome!! im maya, i do mostly functional stuff, mugs bowls plates'],
    ['M', 'ask me anything about glazes, i will talk ur ear off'],
  ]],
  ['general', [
    ['P', 'Does anyone want to share a stall at the spring fair?'],
    ['M', 'me! i can share costs 50/50'],
    ['M', 'i have a tent and weights already'],
    ['P', 'Great, let us talk this week.'],
  ]],
  ['general', [
    ['T', 'Thanks for hosting the open evening. It was lovely to see everyone.'],
    ['M', 'thank u for coming!! and for carrying the tables lol'],
    ['M', 'same time next season?'],
  ]],
  ['general', [
    ['P', 'We have been offered a spot in a local shop for consignment. Thoughts?'],
    ['M', 'depends on the cut tbh'],
    ['M', 'anything over 40% and we are basically paying them to hold our stuff'],
    ['M', 'but if its 30-35 i think its worth trying for a season'],
  ]],
  ['general', [
    ['P', 'Is anyone around to let the electrician in at 9 tomorrow?'],
    ['M', 'i can! im in from 8 anyway'],
  ]],
  ['general', [
    ['T', 'Would anyone be interested in a talk about selling online?'],
    ['M', 'maybe? as long as its not about ads lol'],
    ['M', 'the website and photos bit would be useful tho'],
  ]],
  ['wa', [
    ['T', 'I finally finished a bowl that did not collapse.'],
    ['M', 'WHAT'],
    ['M', 'send pic immediately'],
    ['M', 'ok its wonky but its a BOWL. proud of u 🥹'],
  ]],
  ['wa', [
    ['T', 'Are you going to the ceramics fair in the city next month?'],
    ['M', 'maybe? the stall fee is wild this year'],
    ['M', 'might just go as a visitor and steal ideas haha'],
  ]],
  ['wa', [
    ['T', 'How do you decide what to make next?'],
    ['M', 'mostly whatever people keep asking for at the market'],
    ['M', 'and then one weird thing just for me, so i dont get bored'],
    ['M', 'this month the weird thing is a teapot that will probably leak lol'],
  ]],
  ['wa', [
    ['T', 'The teapot. Did it leak?'],
    ['M', 'it leaked'],
    ['M', 'from the lid somehow?? physics is fake'],
    ['M', 'making another one tomorrow obvs'],
  ]],
  ['wa', [
    ['T', 'You should start a newsletter. People would read it.'],
    ['M', 'haha would they tho'],
    ['M', 'maybe a tiny one, like once a month, kiln news and biscuit updates'],
    ['T', 'Biscuit updates would carry it.'],
    ['M', 'he would want a cut of the profits'],
  ]],
  ['wa', [
    ['T', 'I am cooking for six on Saturday and I am already stressed.'],
    ['M', 'make one big thing, not 4 small things'],
    ['M', 'a stew, a big salad, bread from the good bakery. done'],
    ['M', 'and put it in nice bowls, people think food tastes better in handmade bowls (its true, i have no evidence)'],
  ]],
  ['wa', [
    ['T', 'Do you ever think about moving somewhere bigger?'],
    ['M', 'sometimes'],
    ['M', 'but i like that i know everyone at the market and the guy at the hardware shop saves me buckets'],
    ['M', 'a bigger city would have more customers and fewer bucket guys'],
  ]],
  ['wa', [
    ['T', 'Did you get the landlord to fix the roof in the end?'],
    ['M', 'YES'],
    ['M', 'after ur email he sent someone within a week lol'],
    ['M', 'i owe u a mug, choose any mug'],
  ]],
  ['wa', [
    ['T', 'Good luck with the class tonight.'],
    ['M', 'ty!! 8 beginners, pray for my wheels 🙏'],
  ]],
  ['wa', [
    ['T', 'How did the class go?'],
    ['M', 'so good'],
    ['M', 'one guy made a perfect cylinder first try and i was low key jealous'],
    ['M', 'everyone else made ashtrays as is tradition'],
  ]],
  ['wa', [
    ['T', 'Can I ask you something? Do you ever regret leaving the office job?'],
    ['M', 'not once'],
    ['M', 'i earn less and worry more about money but i dont dread mondays anymore'],
    ['M', 'that trade was worth it for me. not for everyone tho'],
  ]],
  ['wa', [
    ['T', 'What would you tell someone who wants to start pottery as a business?'],
    ['M', 'do it as a hobby for a year first'],
    ['M', 'then price properly from day 1, dont start cheap and try to go up later'],
    ['M', 'and get a good respirator lol'],
  ]],
  ['wa', [
    ['T', 'Are you watching the match tonight?'],
    ['M', 'haha no but tell me if we win so i can pretend i care'],
  ]],
  ['wa', [
    ['T', 'We won, for the record.'],
    ['M', 'wooo!! so happy for us 🎉'],
    ['M', 'who did we play'],
  ]],
  ['wa', [
    ['T', 'My parents are visiting next week. Any ideas for things to do?'],
    ['M', 'bring them to the market on saturday!'],
    ['M', 'and the walk along the canal to the old mill, its flat and pretty'],
    ['M', 'also i will give ur mum a mug, mums love a mug'],
  ]],
  ['wa', [
    ['T', 'I keep starting projects and not finishing them. Any advice?'],
    ['M', 'smaller projects lol'],
    ['M', 'like genuinely. finish one tiny thing this week and see how good it feels'],
    ['M', 'i do that with glaze tests, 10 tiles is a finished thing'],
  ]],
  ['wa', [
    ['T', 'Thank you for the mug, by the way. I use it every morning.'],
    ['M', 'stoppp thats the best thing u could say to me 🥹'],
    ['M', 'it gets better with age, like us'],
  ]],
  ['studio', [
    ['P', 'Can someone show the new members how to load the kiln properly?'],
    ['M', 'i can do it tues evening!'],
    ['M', 'shelves, posts, no glaze touching anything, the usual sermon'],
  ]],
  ['studio', [
    ['P', 'The studio is too cold in the mornings. Should we get a second heater?'],
    ['M', 'yes pls, my hands stop working before 10'],
    ['M', 'cold clay + cold hands = sad cylinders'],
  ]],
  ['general', [
    ['P', 'Thinking of a co-op newsletter. Would anyone write a short piece each month?'],
    ['M', 'i could do a glaze of the month thing!'],
    ['M', 'short tho, like 200 words max or i will ramble'],
  ]],
  ['wa', [
    ['T', 'Is it ridiculous to buy a second bike?'],
    ['M', 'is it ridiculous to have 40 glaze buckets'],
    ['M', 'no. the answer is no'],
  ]],
  ['wa', [
    ['T', 'I had a rough day. Nothing specific, just tired.'],
    ['M', 'aw im sorry'],
    ['M', 'want me to come over with leftover pizza and zero expectations?'],
    ['T', 'That would be nice.'],
    ['M', 'omw in 20 ❤️'],
  ]],
  ['wa', [
    ['T', 'Do you want to split a veg box subscription?'],
    ['M', 'yes!! i always waste half of mine'],
    ['M', 'u take the weird squash tho, i dont know what to do with them'],
  ]],
  ['wa', [
    ['T', 'What did you think of the film?'],
    ['M', 'loved the first half, the ending was a bit much'],
    ['M', 'why does every film need an explosion now lol'],
  ]],
  ['wa', [
    ['T', 'Any plans for the studio next year?'],
    ['M', 'i want to try a wood firing course, the one in the hills'],
    ['M', 'and maybe hire someone one day a week so i can actually make new stuff'],
    ['M', 'and fix the roof for real this time haha'],
  ]],
  ['wa', [
    ['T', 'Do you want to come to my work party? You can be my plus one.'],
    ['M', 'will there be canapes'],
    ['T', 'There will be canapes.'],
    ['M', 'then yes, i will make small talk about clay with ur ceo'],
  ]],
  ['wa', [
    ['T', 'How do you deal with people who say pottery is just a hobby?'],
    ['M', 'i used to argue lol'],
    ['M', 'now i just tell them what a kiln costs and watch their face'],
  ]],
];

// ---- deterministic dates ----
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260301);

function waStamp(d) {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const y = String(d.getUTCFullYear()).slice(2);
  let h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day}/${y}, ${h}:${mm} ${ap}`;
}

const wa = ['3/1/26, 9:00 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.'];
const slack = { studio: new Map(), general: new Map() };
let day = Date.UTC(2026, 2, 2);
let counts = { M: 0, T: 0, P: 0 };

for (const [ch, msgs] of SCENES) {
  day += Math.floor(1 + rand() * 2.5) * 86400000;
  let t = day + Math.floor(8 + rand() * 13) * 3600000 + Math.floor(rand() * 60) * 60000;
  let prev = null;
  for (const [who, text] of msgs) {
    t += who === prev ? Math.floor(10 + rand() * 40) * 1000 : Math.floor(1 + rand() * 9) * 60000;
    prev = who;
    counts[who]++;
    const d = new Date(t);
    if (ch === 'wa') {
      wa.push(`${waStamp(d)} - ${NAMES[who]}: ${text}`);
    } else {
      const key = d.toISOString().slice(0, 10);
      const map = slack[ch];
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ type: 'message', user: { M: 'U01MAYA', T: 'U02THEO', P: 'U03PRIYA' }[who], text, ts: `${Math.floor(t / 1000)}.000${String(counts[who]).padStart(3, '0')}` });
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'slack-riverside-makers'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'WhatsApp Chat with Theo Lindqvist.txt'), wa.join('\n') + '\n');
const users = [
  { id: 'U01MAYA', name: 'maya', real_name: 'Maya Okafor', profile: { display_name: 'maya', real_name: 'Maya Okafor' } },
  { id: 'U02THEO', name: 'theo', real_name: 'Theo Lindqvist', profile: { display_name: 'Theo', real_name: 'Theo Lindqvist' } },
  { id: 'U03PRIYA', name: 'priya', real_name: 'Priya Raman', profile: { display_name: 'Priya', real_name: 'Priya Raman' } },
];
fs.writeFileSync(path.join(OUT, 'slack-riverside-makers', 'users.json'), JSON.stringify(users, null, 2));
fs.writeFileSync(path.join(OUT, 'slack-riverside-makers', 'channels.json'), JSON.stringify([{ id: 'C01', name: 'studio' }, { id: 'C02', name: 'general' }], null, 2));
for (const ch of ['studio', 'general']) {
  fs.mkdirSync(path.join(OUT, 'slack-riverside-makers', ch), { recursive: true });
  for (const [date, msgs] of slack[ch]) fs.writeFileSync(path.join(OUT, 'slack-riverside-makers', ch, `${date}.json`), JSON.stringify(msgs, null, 2));
}
console.log(`Wrote ${counts.M + counts.T + counts.P} fictional messages (Maya ${counts.M}, Theo ${counts.T}, Priya ${counts.P}) to ${OUT}`);
