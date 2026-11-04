# Making the thumbnail file

## Words set over a picture

For exact words in a chosen font: the picture without words (from `generate_image`, or a frame from
the video) and a page of exactly 1280×720 that sets the words over it. Tested in Chrome:

```html
<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&display=block">
<style>
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #000; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .words { position: absolute; left: 64px; top: 56px; max-width: 620px; margin: 0;
           font: 128px/0.95 Anton, Impact, sans-serif; color: #fff; text-transform: uppercase;
           -webkit-text-stroke: 10px #111; paint-order: stroke fill; }
</style></head>
<body><img class="bg" src="picture.png" alt=""><p class="words">It fed the block</p></body></html>
```

- Anton is a tall, heavy free font that fits big words in little room; the dark outline keeps light
  letters readable over any picture. Change the words, their place, colour and font; keep them out
  of the bottom-right corner, where YouTube shows the video's length.
- Without the `<p>`, the same page simply crops a picture to exactly 16:9 (`object-fit: cover`).

Render it from the folder that holds the page and the picture, then make a JPG:

```bash
CHROME="/path/to/chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --window-size=1280,720 \
  --screenshot="$PWD/thumb-a.png" "file://$PWD/thumb-a.html"
ffmpeg -v error -y -i thumb-a.png -q:v 3 thumb-a.jpg
```

- The PNG was 1.3 MB in the test and the JPG 266 KB; upload the JPG.
- `--force-device-scale-factor=2` gives 2560×1440, worth it only when the picture is that sharp.
- Finding Chrome: the browser the app uses is `chrome.path` from `app_api` `GET /api/browser/settings`
  (**Settings → Browser** can download one); otherwise `google-chrome` or `chromium` on Linux, and
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on a Mac. If it stops with "No usable
  sandbox" (some Linux systems), add `--no-sandbox`: the page is your own file.

## A picture straight from the model

Image models make 16:9 at sizes such as 1344×768 or 1376×768. Fill exactly 1280×720 without
stretching, trimming the overflow evenly (check nothing important was at the edges):

```bash
ffmpeg -v error -y -i picture.png -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1" -q:v 2 thumb.jpg
```

`ffmpeg` comes with the media-tools plugin. Without it, use the page above without words.

## Check the file

```bash
file thumb.jpg      # "JPEG image data, ... 1280x720, ..."
wc -c < thumb.jpg   # bytes: under 2,000,000 for an upload from the phone app
```

The limits are YouTube's, and change: compare with its help page on the day.

## A small copy for the preview page

```bash
ffmpeg -v error -y -i thumb-a.jpg -vf scale=320:-2 -q:v 5 small-a.jpg
python3 -c "import base64,sys; print('data:image/jpeg;base64,' + base64.b64encode(open(sys.argv[1],'rb').read()).decode())" small-a.jpg
```

The printed line goes into the candidate's `img` in the preview page: about 21 KB of picture, 28,000
characters of text, per candidate in the test.
