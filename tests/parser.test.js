// Checks the Instagram export parser in savepoint/app.html against sample files in the formats Instagram has used.
// Run: node tests/parser.test.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'savepoint', 'app.html'), 'utf8');
const a = src.indexOf('/* =============== Instagram export parser (PARSER-START)');
const b = src.indexOf('/* (PARSER-END) */');
const code = src.slice(a, b) + '\nmodule.exports={parseSaved,parseCollections,parseLiked,parsePeople,kindOf,sniff,fixText,newImport,addParsed};';
const m = {exports:{}}; new Function('module','TextDecoder', code)(m, TextDecoder);
const P = m.exports;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

// Classic saved_posts format
const saved = {saved_saved_media: [
  {title: 'pasta.queen', string_map_data: {'Saved on': {href: 'https://www.instagram.com/p/CxAbc123_-/', timestamp: 1700000000}}},
  {title: 'reel.guy', string_map_data: {'Saved on': {href: 'https://www.instagram.com/reel/Cy9ZZZzzz1/', timestamp: 1700100000}}},
]};
let r = P.parseSaved(saved);
ok(r.length === 2 && r[0].id === 'CxAbc123_-' && r[0].author === 'pasta.queen' && r[0].ts === 1700000000 && r[0].type === 'post', 'classic saved_posts');
ok(r[1].type === 'reel' && r[1].author === 'reel.guy', 'reel type detected');

// Newer label_values style
const saved2 = {saved_saved_media: [{timestamp: 1710000000, label_values: [{label: 'URL', value: 'https://www.instagram.com/p/DAbCdEfGhIj/'}, {label: 'Username', value: 'travel.kit'}]}]};
r = P.parseSaved(saved2);
ok(r.length === 1 && r[0].author === 'travel.kit' && r[0].ts === 1710000000, 'label_values saved format');

// Collections: sequential header format
const cols = {saved_saved_collections: [
  {title: 'Collection', string_map_data: {Name: {value: 'Recipes ð\u009f\u008d\u009d'}, 'Creation Time': {timestamp: 1690000000}}},
  {string_map_data: {Name: {value: 'pasta.queen', href: 'https://www.instagram.com/p/CxAbc123_-/'}, 'Added Time': {timestamp: 1700000001}}},
  {title: 'Collection', string_map_data: {Name: {value: 'Trips'}, 'Creation Time': {timestamp: 1690000000}}},
  {title: 'Trips', string_map_data: {Name: {value: 'wander.wren', href: 'https://www.instagram.com/reel/Cz1111111/'}, 'Added Time': {timestamp: 1700000002}}},
]};
r = P.parseCollections(cols);
ok(r.length === 2, 'collections count ' + r.length);
ok(r[0].col.startsWith('Recipes') && r[0].col.includes('\u{1F35D}'), 'collection name + mojibake fix: ' + JSON.stringify(r[0].col));
ok(r[0].author === 'pasta.queen', 'collection item author');
ok(r[1].col === 'Trips' && r[1].author === 'wander.wren', 'item author not taken from title: ' + r[1].author);

// Collections: nested format
const cols2 = {saved_saved_collections: [{title: 'Fits', media: [
  {title: 'thrift.co', string_list_data: [{href: 'https://www.instagram.com/p/AAAAA11111/', timestamp: 1}]},
  {title: 'fitcheck', string_list_data: [{href: 'https://www.instagram.com/p/BBBBB22222/', timestamp: 2}]}]}]};
r = P.parseCollections(cols2);
ok(r.length === 2 && r.every(x => x.col === 'Fits') && r[1].author === 'fitcheck', 'nested collections format');

// Followers (root array) and following (title-based, 2025 style)
const followers = [{title: '', media_list_data: [], string_list_data: [{href: 'https://www.instagram.com/jay.wav', value: 'jay.wav', timestamp: 1650000000}]}];
const following = {relationships_following: [
  {title: 'mira_art', string_list_data: [{href: 'https://www.instagram.com/_u/mira_art', timestamp: 1660000000}]},
  {title: '', string_list_data: [{href: 'https://www.instagram.com/theo.exe', value: 'theo.exe', timestamp: 1660000001}]}]};
ok(P.parsePeople(followers)[0].u === 'jay.wav', 'followers root array');
const fo = P.parsePeople(following);
ok(fo.length === 2 && fo[0].u === 'mira_art' && fo[1].u === 'theo.exe', 'following both styles');

// Liked
const liked = {likes_media_likes: [{title: 'pasta.queen', string_list_data: [{href: 'https://www.instagram.com/p/CxAbc123_-/', value: 'ð\u009f\u0091\u008d', timestamp: 1700000000}]}]};
ok(P.parseLiked(liked)[0].author === 'pasta.queen', 'liked posts');

// File classification + sniffing
ok(P.kindOf('your_instagram_activity/saved/saved_posts.json') === 'saved', 'kindOf saved');
ok(P.kindOf('connections/followers_and_following/followers_2.json') === 'followers', 'kindOf followers_2');
ok(P.kindOf('connections/followers_and_following/following.json') === 'following', 'kindOf following');
ok(P.kindOf('saved_posts.html') === 'html', 'kindOf html export');
ok(P.kindOf('media/posts/abc.jpg') === '', 'ignores media');
ok(P.sniff(saved) === 'saved' && P.sniff(followers) === 'followers' && P.sniff(cols) === 'cols', 'sniff by content');

// Pipeline
const res = P.newImport(); P.addParsed(res, 'saved', saved); P.addParsed(res, 'followers', followers); P.addParsed(res, 'followers', followers);
ok(res.saved.length === 2 && res.followers.length === 2 && res.files === 3, 'addParsed accumulates split follower files');
