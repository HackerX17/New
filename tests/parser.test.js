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

// Captions (newer exports): string_map_data and label_values styles; a one-word caption must not become the author
const capA = {saved_saved_media: [{title: 'pasta.queen', string_map_data: {'Saved on': {href: 'https://www.instagram.com/p/CapAAAAA11/', timestamp: 1}, Caption: {value: 'Garlic  chili\nnoodles \u00f0\u009f\u008d\u009c'}}}]};
r = P.parseSaved(capA);
ok(r[0].cap === 'Garlic chili noodles \u{1F35C}' && r[0].author === 'pasta.queen', 'caption from string_map_data: ' + JSON.stringify(r[0].cap));
const capB = {saved_saved_media: [{timestamp: 2, label_values: [{label: 'Caption', value: 'yum'}, {label: 'URL', value: 'https://www.instagram.com/reel/CapBBBBB22/'}, {label: 'Username', value: 'chef.kai'}]}]};
r = P.parseSaved(capB);
ok(r[0].cap === 'yum' && r[0].author === 'chef.kai', 'caption from label_values, author kept');
const capC = {saved_saved_media: [{timestamp: 3, label_values: [{label: 'Caption', value: 'yum'}, {label: 'URL', value: 'https://www.instagram.com/p/CapCCCCC33/'}]}]};
ok(P.parseSaved(capC)[0].author === '', 'one-word caption is not used as the author');
ok(P.parseSaved(saved)[0].cap === '', 'no caption when the export has none');

// Newer collections files: headers may link to the Saved collection; posts with no usable link must be skipped, not
// mistaken for collections (that bug created collections named after creators).
const colsNew = {saved_saved_collections: [
  {title: 'Collection', string_map_data: {Name: {value: 'AI tools', href: 'https://www.instagram.com/someone/saved/ai-tools/17890000000000001/'}, 'Creation Time': {timestamp: 1}, 'Update Time': {timestamp: 2}}},
  {string_map_data: {Name: {value: 'Daniel Beleiu', href: 'https://www.instagram.com/reel/AiPost00001/'}, 'Added Time': {timestamp: 3}}},
  {title: 'Daniel Beleiu', string_map_data: {Name: {value: 'Daniel Beleiu'}, 'Added Time': {timestamp: 4}}},
  {title: 'UFD Tech', string_map_data: {Name: {value: 'UFD Tech'}}},
  {string_map_data: {Name: {value: 'UFD Tech', href: 'https://www.instagram.com/p/AiPost00002/'}, 'Added Time': {timestamp: 5}}},
  {string_map_data: {Name: {value: 'Money'}, 'Creation Time': {timestamp: 6}}},
  {string_map_data: {Name: {value: 'Sumit', href: 'https://www.instagram.com/p/MoneyPost01/'}, 'Added Time': {timestamp: 7}}},
]};
r = P.parseCollections(colsNew);
ok(r.length === 3, 'newer collections file: 3 posts found, unlinked entries skipped (' + r.length + ')');
ok(r[0].col === 'AI tools' && r[1].col === 'AI tools', 'header that links to the Saved collection is used as the collection name');
ok(r[1].id === 'AiPost00002', 'an unlinked post does not start a fake collection named after its creator');
ok(r[2].col === 'Money' && r[2].id === 'MoneyPost01', 'header without a title but with Creation Time starts a new collection');
ok(!r.some(x => /Beleiu|UFD/.test(x.col)), 'no collection is named after a creator');

const colsLabels = {saved_saved_collections: [
  {label_values: [{label: 'Collection name', value: 'Music'}, {label: 'Creation Time', timestamp_value: 1}]},
  {label_values: [{label: 'URL', value: 'https://www.instagram.com/reel/MusicReel01/'}, {label: 'Name', value: 'Smply Sound'}, {label: 'Added Time', timestamp_value: 2}]},
  {label_values: [{label: 'Name', value: 'Gone Creator'}, {label: 'Added Time', timestamp_value: 3}]},
  {label_values: [{label: 'URL', value: 'https://www.instagram.com/p/MusicPost02/'}, {label: 'Name', value: 'Ella Rose'}, {label: 'Added Time', timestamp_value: 4}]},
]};
r = P.parseCollections(colsLabels);
ok(r.length === 2 && r.every(x => x.col === 'Music'), 'label-style collections file: posts land in "Music", the unlinked one is skipped');

// Pipeline
const res = P.newImport(); P.addParsed(res, 'saved', saved); P.addParsed(res, 'followers', followers); P.addParsed(res, 'followers', followers);
ok(res.saved.length === 2 && res.followers.length === 2 && res.files === 3, 'addParsed accumulates split follower files');
