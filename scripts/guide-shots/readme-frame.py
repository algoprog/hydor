#!/usr/bin/env python3
"""Gives the README's window pictures their rounded corners and a thin border, and makes readme-phone.webp: the
phone's screen over the session's window, dimmed and blurred. Needs Pillow.

  python3 scripts/guide-shots/readme-frame.py <folder with the shots> <where the pictures go, docs/media>
"""
import sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
BORDER = (53, 54, 62, 255)
SIZE = (1600, 1000)
SCALE = 4  # the corners are drawn at four times the size and shrunk, so they are smooth


def rounded(w, h, r):
    big = Image.new('L', (w * SCALE, h * SCALE), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, w * SCALE - 1, h * SCALE - 1), r * SCALE, fill=255)
    return big.resize((w, h), Image.LANCZOS)


def frame(im, radius=23, width=2):
    """A window: the picture inside a thin border, its corners cut round."""
    im = im.convert('RGBA')
    w, h = im.size
    outer = rounded(w, h, radius)
    inner = Image.new('L', (w, h), 0)
    inner.paste(rounded(w - 2 * width, h - 2 * width, radius - width), (width, width))
    out = Image.new('RGBA', (w, h), BORDER)
    out.paste(im, (0, 0), inner)
    out.putalpha(outer)
    return out


def open_shot(name):
    return Image.open(f'{src}/{name}.webp').convert('RGB')


for name in ['readme-agents', 'readme-memory', 'readme-automation', 'readme-answers', 'readme-library']:
    frame(open_shot(name).resize(SIZE, Image.LANCZOS)).save(f'{dst}/{name}.webp', quality=80)

# The phone over the session's window.
back = open_shot('readme-agents').resize(SIZE, Image.LANCZOS)
back = ImageEnhance.Brightness(back).enhance(0.3).filter(ImageFilter.GaussianBlur(3))
screen = open_shot('readme-phone-screen')
pw, ph = 406, 878
screen = screen.resize((pw, ph), Image.LANCZOS)
rim = 3
phone = Image.new('RGBA', (pw + 2 * rim, ph + 2 * rim), (0, 0, 0, 0))
phone_w, phone_h = phone.size
body = Image.new('RGBA', phone.size, (62, 63, 72, 255))
body.paste(screen, (rim, rim), rounded(pw, ph, 40))
phone.paste(body, (0, 0), rounded(phone_w, phone_h, 43))
back = back.convert('RGBA')
back.alpha_composite(phone, ((SIZE[0] - phone_w) // 2, (SIZE[1] - phone_h) // 2))
frame(back).save(f'{dst}/readme-phone.webp', quality=80)
