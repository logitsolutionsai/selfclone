// A fixed list of English function words (articles, pronouns, auxiliaries,
// prepositions, conjunctions, common adverbs and contractions). These carry
// style rather than topic, which is why stylometry relies on them.
export const FUNCTION_WORDS = [
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'almost', 'also', 'although',
  'always', 'am', 'among', 'an', 'and', 'another', 'any', 'anyone', 'anything', 'are',
  'around', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between',
  'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'either', 'enough', 'even', 'ever', 'every', 'everything', 'few',
  'for', 'from', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'him', 'himself', 'his', 'how', 'however', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'itself', 'just', 'less', 'like', 'many', 'may', 'me', 'might',
  'mine', 'more', 'most', 'much', 'must', 'my', 'myself', 'neither', 'never', 'no',
  'nor', 'not', 'nothing', 'now', 'of', 'off', 'often', 'on', 'once', 'one',
  'only', 'or', 'other', 'our', 'ours', 'out', 'over', 'own', 'perhaps', 'quite',
  'rather', 'really', 'same', 'shall', 'she', 'should', 'since', 'so', 'some', 'someone',
  'something', 'still', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'therefore', 'these', 'they', 'this', 'those', 'though', 'through', 'thus', 'to', 'too',
  'toward', 'under', 'unless', 'until', 'up', 'upon', 'us', 'very', 'was', 'we',
  'well', 'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'who', 'whom',
  'whose', 'why', 'will', 'with', 'within', 'without', 'would', 'yet', 'you', 'your',
  "don't", "i'm", "it's", "that's", "can't", "i'll", "you're", "didn't", "isn't", "won't",
  "i've", "let's", "there's", "doesn't", "wasn't", "i'd", "we're", "they're",
];

export const FUNCTION_WORD_SET = new Set(FUNCTION_WORDS);

// Extra words that are not stylistically interesting as "topic words" or as
// signature phrases on their own (chat filler, numbers spelled out, etc.).
export const EXTRA_STOPWORDS = new Set([
  'yes', 'yeah', 'yep', 'ok', 'okay', 'oh', 'ah', 'um', 'uh', 'got', 'get', 'go', 'going',
  'know', 'think', 'want', 'make', 'see', 'say', 'said', 'thing', 'things', 'way', 'lot',
  'two', 'three', 'first', 'last', 'good', 'new', 'time', 'day', 'today', 'tomorrow',
  'gonna', 'wanna', 'gotta', 'im', 'dont', 'cant', 'thats', 'its', 'ive', 'youre', 'id',
  'ill', 'didnt', 'doesnt', 'isnt', 'wont', 'lets', 'theres', 'u', 'ur', 'r', 'ya', 'yo',
  'also', 'via', 'per', 'url', 'email', 'phone', 'link', 'token', 'password', 'card', 'iban',
]);
