# Savepoint

Organize everything you've saved on Instagram into boards, and turn the sorting into a game.

**Live app:** https://claude.ai/artifact/7kJG9uC59nBhzq5JfrWx5V
**What to build next (ideas page):** https://claude.ai/artifact/DrDnhH9iARUAjoMtjyBZYR

## What it does

- **Library**: every saved post and reel, with search, filters (unsorted, reels, posts, 4+ stars, to try, done) and grid or list views. Bulk-select to move, mark done or let go.
- **Sort mode**: one save at a time. Press `1`–`9` to file into a board, `S` to skip, `L` to let go, `Z` to undo, `O` to open on Instagram. Fast choices build a combo that multiplies XP. There's also a 60-second sprint with a best score.
- **Creator batching and autopilot rules**: file one post from a creator and Savepoint offers to file all their other saves too, or make a rule so their future saves go there automatically.
- **Boards**: your own folders, with colors and quick-add templates. Collections you made on Instagram become boards when you import.
- **Item details**: name each save ("what is it?"), tag it, rate it 1–5 stars, and track it as *Want to try*, *In progress* or *Done*.
- **People**: from your followers and following lists, see who doesn't follow you back, who you don't follow back, mutuals, and creators you save a lot but don't follow. Label accounts and work through a review queue.
- **Stats**: saves per month, top creators, board sizes, reels vs posts, your busiest month, favorite day to save, night-owl saves, and "on this day" flashbacks.
- **Trophies**: XP, levels with titles, a daily streak and 18 achievements.
- **Three looks** taken from earlier projects: *Night Arcade* (the arcade games), *Star Atlas* (Synastry Score) and *Kinetic*.
- **Backup**: download a JSON backup or a CSV spreadsheet, and restore from a backup.

## Getting your Instagram data

Instagram doesn't let apps read your saved posts directly, so Savepoint uses the download Instagram gives you:

1. In the Instagram app, go to your profile and tap the menu (three lines, top right) to open **Settings and activity**.
2. Tap **Meta Account**, the first item under "Your account". Older versions call it **Accounts Center**.
3. Tap **Your information and permissions**, then **Export your information**. Older versions call it **Download your information**.
4. Tap **Create export**, pick your Instagram profile, then **Export to device**.
5. Tap **Customize information**. Everything starts ticked, so clear it all and tick only **Saved**, **Likes** and **Followers and following**.
6. Set **Date range** to **All time** and **Format** to **JSON**, then tap **Start export**.
7. When Instagram says it's ready, go back to **Export your information**, tap **Download**, and drop the ZIP into Savepoint's **Import & data** page. The link expires after a few days.

"Archiving and downloading" in Settings is a different feature that saves your own photos; it isn't this export.

For very large downloads, unzip the file on a computer and use **Choose an unzipped folder** instead. You can also paste individual post or reel links.

The export has no images of other people's posts, so each save gets a generated cover from its creator's name. When the export includes post captions, Savepoint shows them on each save and searches them. Use **Open on Instagram** to see the post itself.

## Privacy

Your download is read on your own device. Savepoint stores only the list of saves (post links, creator names, dates) and how you organize them.

- In the live app, that data is saved to your Claude account under a per-person private path. Nobody else who opens the page can read it, including the page's owner.
- In the standalone build, it's saved in your browser's local storage.

## Run it yourself

`savepoint/app.html` is the source. It's written as a page body, which is the format claude.ai publishes. To get a standalone page you can open locally or host anywhere (for example on GitHub Pages), run:

```sh
./scripts/build.sh   # writes savepoint/index.html
```

When it runs outside claude.ai, Savepoint saves to local storage and can show Instagram's own post embed in the details panel.

## Importing on a phone

- Pick the ZIP exactly as Instagram gave it. Savepoint recognizes files by their contents, so it works even when the phone hands it over without a `.zip` name.
- Savepoint reads only the few data files it needs from inside the ZIP. A large download that includes photos and videos still opens.
- If tapping **Tap to choose your Instagram ZIP** doesn't open your files inside the Claude app, open the same page in your phone's browser or on a computer and import there. Your library is saved to your Claude account, so it shows up in the app too, including on a page that's already open.

## Tests

```sh
node tests/parser.test.js                    # parser, 22 checks
python3 tests/make_fixtures.py /tmp/fx        # fake Instagram downloads (fictional accounts)
./scripts/build.sh && node tests/e2e.js /tmp/fx   # every screen and control, 111 checks
```

`parser.test.js` runs the Instagram export parser against sample files in the formats Instagram has used: classic and label-based saved posts, sequential and nested collections, followers split across files, captions, and garbled emoji in collection names.

`e2e.js` drives the app in a real browser three ways:

- **Android-size phone, as on claude.ai.** A stand-in for account storage enforces its rules: per-person paths, the 256 KiB document limit, no nested lists.
- **Desktop, standalone page.**
- **A full 60-second sprint on a fast clock.**

It covers:

- **Importing** a ZIP with no file extension, a very large ZIP format (66,000 files), an uncompressed ZIP, several JSON files at once, a renamed JSON file, an unzipped folder, and drag and drop.
- **Rejecting clearly** an HTML-format download, a half-downloaded ZIP and an unrelated file.
- **Every control:** library filters, search, sorting, bulk actions, the details panel, Sort mode keys and buttons, boards, rules, people, stats, trophies, looks, backup, CSV, restore and erase.
- **Sync and layout:** changes arriving from another device, and no sideways scrolling on any page.

## Layout

```
savepoint/app.html             the app (source)
savepoint/index.html           standalone build (generated by scripts/build.sh)
ideas/what-to-build-next.html  ranked ideas for future projects, with concept sketches
tests/parser.test.js           parser tests
scripts/build.sh               builds the standalone page
```
