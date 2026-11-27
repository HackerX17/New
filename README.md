# Savepoint

Sort everything you've saved on Instagram into folders, one post at a time.

There are two versions:

- **The website (start here):** https://hackerx17.github.io/New/
  - It shows each saved post itself, using Instagram's official embed, with your folders as big buttons at the bottom of the screen. Tap a folder and the next post appears.
  - **Open in Instagram** jumps straight into the Instagram app on Android.
  - It runs in any browser, with no sign-in. Your sorting is saved in that browser.
- **The Claude version:** https://claude.ai/artifact/7kJG9uC59nBhzq5JfrWx5V
  - It has more extras: stats, trophies, and follower insights.
  - It syncs through your Claude account, but it can't show post pictures.

## The website

`site/index.src.html` is the source. `./scripts/build.sh` writes the finished page to `index.html` at the repo root, copying in the Instagram export reader from `savepoint/app.html` so the two versions read files the same way. GitHub Pages serves `index.html`.

To publish it on GitHub Pages, you have to change two settings on github.com yourself:

1. **Make the repo public.** Go to Settings, then General, then Danger Zone, then Change visibility, and pick Public.
2. **Turn on Pages.** Go to Settings, then Pages. Under "Build and deployment", set Source to **Deploy from a branch**. Pick the default branch with the **/ (root)** folder, then Save.

After about a minute it's live at https://hackerx17.github.io/New/.

How it works:

- **Choose your Instagram ZIP.** Your Instagram collections become folders, and posts already in them are filed.
- **Sort:** you see the post, then tap a folder. **Skip** shows it again later. **Don't need** sets it aside (it stays saved on Instagram). **Undo** takes back your last tap.
- **Creator shortcut:** when a creator has more posts waiting, you can put them all in the same folder at once.
- **Folders:** lists everything you've sorted. Tap a post to see it, move it, or open it in Instagram.
- **Menu:**
  - add more saves (a new ZIP, or pasted post links)
  - change the sort order
  - download a backup or restore one; backups from the Claude version work too
  - erase everything

Posts from private accounts, or posts that were deleted, can't show a preview. Use **Open in Instagram** or **Don't need** for those.

## The Claude version

## What it does

- **Library**: every saved post and reel, with search, filters (unsorted, reels, posts, 4+ stars, to try, done) and grid or list views. Bulk-select to move, mark done or let go.
- **Sort mode**: one save at a time. Press `1`–`9` to file into a board, `S` to skip, `L` to let go, `Z` to undo, `O` to open on Instagram. Fast choices build a combo that multiplies XP. There's also a 60-second sprint with a best score.
- **Creator batching and autopilot rules**: file one post from a creator and Savepoint offers to file all their other saves too, or make a rule so their future saves go there automatically.
- **Boards**: your own folders, with colors and quick-add templates. Collections you made on Instagram become boards when you import.
- **Item details**: name each save ("what is it?"), tag it, rate it 1–5 stars, and track it as *Want to try*, *In progress* or *Done*.
- **People**: from your followers and following lists, see who doesn't follow you back, who you don't follow back, mutuals, and creators you save a lot but don't follow. Label accounts and work through a review queue.
- **Stats**: saves per month, top creators, board sizes, reels vs posts, your busiest month, favorite day to save, night-owl saves, and "on this day" flashbacks.
- **Trophies**: XP, levels with titles, a daily streak and 18 achievements.
- **Guide**: the **?** button in the top bar opens a step-by-step guide: a five-step quick start, how to see and add posts, what every button on every screen does, and common questions.
- **Three looks** taken from earlier projects: *Night Arcade* (the arcade games), *Star Atlas* (Synastry Score) and *Kinetic*. Pick one, and turn sound effects on or off, from the palette button.
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
node tests/parser.test.js                         # parser, 22 checks
python3 tests/make_fixtures.py /tmp/fx            # fake Instagram downloads (fictional accounts)
./scripts/build.sh
node tests/site.e2e.js /tmp/fx                    # the website, 40 checks
node tests/e2e.js /tmp/fx                         # the Claude version, 122 checks
```

`site.e2e.js` serves the website the way GitHub Pages does. It replaces Instagram with a stand-in embed that reports its height like the real one. It checks:

- **Import:** importing a ZIP turns collections into folders.
- **Sorting:** filing, skip, Don't need, undo, new folders while sorting, and filing a creator's other posts.
- **Folders:** previewing a post, moving it, renaming and deleting folders.
- **Menu:** pasted links, backup and restore (including backups from the Claude version) and erase.
- **App link:** the Instagram app link on Android.
- **Layout:** the folder buttons stay on screen, with no sideways scrolling on Android, iPhone and desktop.

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
index.html                     the website (generated by scripts/build.sh; served by GitHub Pages)
site/index.src.html            the website's source
savepoint/app.html             the Claude version (source)
savepoint/index.html           the Claude version as a standalone page (generated)
ideas/what-to-build-next.html  ranked ideas for future projects, with concept sketches
tests/parser.test.js           parser tests
tests/site.e2e.js              website test
tests/e2e.js                   Claude version test
tests/make_fixtures.py         builds fake Instagram downloads for the tests
scripts/build.sh               builds the standalone page
```
