"""Builds fake Instagram "Export your information" downloads for the end-to-end test.

Everything is invented (fictional accounts and post codes). Run:
  python3 tests/make_fixtures.py <out_dir>
"""
import json, os, random, sys, zipfile

out = sys.argv[1] if len(sys.argv) > 1 else 'tests/fixtures'
os.makedirs(out, exist_ok=True)
R = random.Random(42)
ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
code = lambda: 'C' + ''.join(R.choice(ALPH) for _ in range(10))
creators = [f'creator.{w}{i}' for i, w in enumerate(['noodle', 'trail', 'lift', 'thread', 'pixel', 'cozy', 'giggle', 'sketch', 'beat', 'plant', 'brunch', 'route'] * 3)]
mojibake = lambda s: s.encode('utf-8').decode('latin-1')  # how Instagram exports encode non-ASCII text

N = 400
saved = []
for i in range(N):
    a = R.choice(creators)
    kind = 'reel' if R.random() < .6 else 'p'
    entry = {'title': a, 'string_map_data': {'Saved on': {'href': f'https://www.instagram.com/{kind}/{code()}/', 'timestamp': 1580000000 + i * 170000}}}
    if i % 5 == 0:
        entry['string_map_data']['Caption'] = {'value': mojibake(f'Post number {i} ✨ worth trying')}
    saved.append(entry)
saved_posts = {'saved_saved_media': saved}

cols = []
names = [mojibake('Recipes 🍜'), 'Trips', 'Gym', 'Fits']
for ci, nm in enumerate(names):
    cols.append({'title': 'Collection', 'string_map_data': {'Name': {'value': nm}, 'Creation Time': {'timestamp': 1600000000 + ci}}})
    for e in saved[ci * 20: ci * 20 + 15]:
        href = e['string_map_data']['Saved on']['href']
        cols.append({'string_map_data': {'Name': {'value': e['title'], 'href': href}, 'Added Time': {'timestamp': e['string_map_data']['Saved on']['timestamp']}}})
saved_collections = {'saved_saved_collections': cols}

liked = {'likes_media_likes': [{'title': R.choice(creators), 'string_list_data': [{'href': f'https://www.instagram.com/p/{code()}/', 'value': mojibake('👍'), 'timestamp': 1600000000 + i}]} for i in range(600)]}
people = [f'friend.{i:03d}' for i in range(300)]
following_list = people[:200] + creators[:20]
followers_list = people[100:300]
followers_1 = [{'title': '', 'media_list_data': [], 'string_list_data': [{'href': f'https://www.instagram.com/{u}', 'value': u, 'timestamp': 1550000000 + k}]} for k, u in enumerate(followers_list[:120])]
followers_2 = [{'title': '', 'media_list_data': [], 'string_list_data': [{'href': f'https://www.instagram.com/{u}', 'value': u, 'timestamp': 1550000000 + k}]} for k, u in enumerate(followers_list[120:])]
following = {'relationships_following': [{'title': u, 'string_list_data': [{'href': f'https://www.instagram.com/_u/{u}', 'timestamp': 1560000000 + k}]} for k, u in enumerate(following_list)]}
unfollowed = {'relationships_unfollowed_users': [{'title': f'old.pal{i}', 'string_list_data': [{'href': f'https://www.instagram.com/_u/old.pal{i}', 'timestamp': 1700000000 + i}]} for i in range(5)]}

files = {
    'your_instagram_activity/saved/saved_posts.json': saved_posts,
    'your_instagram_activity/saved/saved_collections.json': saved_collections,
    'your_instagram_activity/likes/liked_posts.json': liked,
    'connections/followers_and_following/followers_1.json': followers_1,
    'connections/followers_and_following/followers_2.json': followers_2,
    'connections/followers_and_following/following.json': following,
    'connections/followers_and_following/recently_unfollowed_profiles.json': unfollowed,
    'your_instagram_activity/messages/inbox/someone_1/message_1.json': {'messages': [{'content': 'hi'}]},
}

def write_zip(path, method=zipfile.ZIP_DEFLATED, extra_files=0, media=True):
    with zipfile.ZipFile(path, 'w', method) as z:
        for name, data in files.items():
            z.writestr(name, json.dumps(data))
        z.writestr('start_here.html', '<html><body>Your information</body></html>')
        if media:
            z.writestr('media/posts/202401/12345.jpg', os.urandom(2_000_000), compress_type=zipfile.ZIP_STORED)
        for i in range(extra_files):
            z.writestr(f'media/other/{i}.txt', 'x', compress_type=zipfile.ZIP_STORED)

write_zip(f'{out}/export.zip')
write_zip(f'{out}/export_stored.zip', method=zipfile.ZIP_STORED)
write_zip(f'{out}/export_zip64.zip', extra_files=66000, media=False)  # >65,535 entries forces the ZIP64 directory
with zipfile.ZipFile(f'{out}/export_html.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('your_instagram_activity/saved/saved_posts.html', '<html></html>')
    z.writestr('connections/followers_and_following/followers_1.html', '<html></html>')
data = open(f'{out}/export.zip', 'rb').read()
open(f'{out}/export_truncated.zip', 'wb').write(data[:len(data) // 2])
open(f'{out}/random.bin', 'wb').write(os.urandom(5000))
for name in ['saved_posts.json', 'followers_1.json', 'following.json']:
    src = [k for k in files if k.endswith('/' + name)][0]
    open(f'{out}/{name}', 'w').write(json.dumps(files[src]))
open(f'{out}/renamed_download.json', 'w').write(json.dumps(saved_posts))  # sniffed by content
folder = f'{out}/unzipped/instagram-export'
for name, d in files.items():
    os.makedirs(os.path.dirname(f'{folder}/{name}'), exist_ok=True)
    open(f'{folder}/{name}', 'w').write(json.dumps(d))
expected = {'saved': N, 'collections': len(names), 'captions': N // 5, 'liked': 600, 'following': len(following_list), 'followers': len(followers_list),
            'mutuals': len(set(following_list) & set(followers_list)), 'nfb': len(set(following_list) - set(followers_list)), 'fans': len(set(followers_list) - set(following_list)), 'unfollowed': 5}
json.dump(expected, open(f'{out}/expected.json', 'w'))
print(json.dumps(expected))
