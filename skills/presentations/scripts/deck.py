"""Clean 16:9 slides with python-pptx: one look throughout (fonts, sizes, an accent colour), real
title placeholders (so outlines, accessibility and readers see each slide's title), text kept
inside its boxes, speaker notes.

    import sys; sys.path.insert(0, "<this skill's folder>/scripts")
    from deck import Deck
    d = Deck(accent="1F6FEB")
    d.title("Launch plan", "Spring 2026 · Marketing")
    d.bullets("Goals", ["Grow sales", ("Europe first", 1), "Keep costs flat"], notes="Why Europe: …")
    d.image("The new store", "store.jpg", caption="Opening day")
    d.two_columns("Before and after", ["Slow checkout"], ["Two-tap checkout"], left_title="Before", right_title="After")
    d.table("Visitors", [["Month", "Visitors"], ["Jan", "1,000"], ["Feb", "1,300"]])
    d.chart("Sales", ["Q1", "Q2"], {"2025": [1, 2], "2026": [2, 3]}, kind="column")
    d.section("Next steps")
    d.save("launch.pptx")

Each method returns the slide, for anything more (python-pptx's own API).
"""
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

W, H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.7)
TITLE_TOP, TITLE_H = Inches(0.45), Inches(1.0)
BODY_TOP = Inches(1.8)
BODY_H = H - BODY_TOP - Inches(0.6)
CHARTS = {"column": XL_CHART_TYPE.COLUMN_CLUSTERED, "bar": XL_CHART_TYPE.BAR_CLUSTERED, "line": XL_CHART_TYPE.LINE_MARKERS, "pie": XL_CHART_TYPE.PIE, "stacked": XL_CHART_TYPE.COLUMN_STACKED}


def _rgb(hex_):
    return RGBColor.from_string(hex_.lstrip("#").upper())


class Deck:
    def __init__(self, accent="1F6FEB", font="Calibri", text="1F2328", muted="59636E", template=None):
        self.prs = Presentation(template) if template else Presentation()
        if not template:
            self.prs.slide_width, self.prs.slide_height = W, H
        self.accent, self.font, self.ink, self.muted = accent, font, text, muted

    # ---- pieces ----
    def _layout(self, name_part, fallback):
        for l in self.prs.slide_layouts:
            if name_part.lower() in l.name.lower():
                return l
        return self.prs.slide_layouts[fallback]

    def _style(self, run, size, bold=False, color=None):
        f = run.font
        f.name, f.size, f.bold = self.font, Pt(size), bold
        f.color.rgb = _rgb(color or self.ink)

    def _place(self, shape, left, top, width, height):
        shape.left, shape.top, shape.width, shape.height = int(left), int(top), int(width), int(height)

    def _title(self, slide, text, size=34):
        t = slide.shapes.title
        self._place(t, MARGIN, TITLE_TOP, W - 2 * MARGIN, TITLE_H)
        tf = t.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.BOTTOM
        tf.text = text
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        for r in p.runs:
            self._style(r, size if len(text) < 48 else size - 6, bold=True)
        bar = slide.shapes.add_shape(1, MARGIN, TITLE_TOP + TITLE_H + Inches(0.08), Inches(1.1), Inches(0.07))
        bar.fill.solid()
        bar.fill.fore_color.rgb = _rgb(self.accent)
        bar.line.fill.background()
        return t

    def _bullet(self, paragraph, level, char="•"):
        pPr = paragraph._p.get_or_add_pPr()
        pPr.set("marL", str(int(Inches(0.32 + 0.4 * level))))
        pPr.set("indent", str(-int(Inches(0.28))))
        for tag in ("a:buNone", "a:buChar", "a:buAutoNum", "a:buFont"):
            for el in pPr.findall(qn(tag)):
                pPr.remove(el)
        font = pPr.makeelement(qn("a:buFont"), {"typeface": "Arial"})
        bu = pPr.makeelement(qn("a:buChar"), {"char": char})
        pPr.append(font)
        pPr.append(bu)

    def _lines(self, frame, items, size, bullets=True):
        """Fills a text frame with items: strings, or (text, level) pairs."""
        frame.word_wrap = True
        frame.clear()
        many = len(items) > 6 or sum(len(i if isinstance(i, str) else i[0]) for i in items) > 420
        for k, item in enumerate(items):
            text, level = (item, 0) if isinstance(item, str) else (item[0], int(item[1]))
            p = frame.paragraphs[0] if k == 0 else frame.add_paragraph()
            p.text = text
            p.level = min(level, 4)
            p.space_after = Pt(8 if level == 0 else 4)
            if bullets:
                self._bullet(p, level, "•" if level == 0 else "–")
            for r in p.runs:
                self._style(r, (size - 4 if many else size) - 3 * level, color=self.ink if level == 0 else self.muted)

    def _notes(self, slide, notes):
        if notes:
            slide.notes_slide.notes_text_frame.text = notes

    def _textbox(self, slide, left, top, width, height):
        box = slide.shapes.add_textbox(int(left), int(top), int(width), int(height))
        box.text_frame.word_wrap = True
        return box

    # ---- slides ----
    def title(self, title, subtitle=None, notes=None):
        s = self.prs.slides.add_slide(self._layout("Title Slide", 0))
        t = s.shapes.title
        self._place(t, MARGIN, Inches(2.3), W - 2 * MARGIN, Inches(1.6))
        t.text_frame.word_wrap = True
        t.text_frame.vertical_anchor = MSO_ANCHOR.BOTTOM
        t.text_frame.text = title
        t.text_frame.paragraphs[0].alignment = PP_ALIGN.LEFT
        for r in t.text_frame.paragraphs[0].runs:
            self._style(r, 44 if len(title) < 40 else 36, bold=True)
        bar = s.shapes.add_shape(1, MARGIN, Inches(4.05), Inches(1.4), Inches(0.08))
        bar.fill.solid()
        bar.fill.fore_color.rgb = _rgb(self.accent)
        bar.line.fill.background()
        sub = [p for p in s.placeholders if p.placeholder_format.idx == 1]
        if sub and subtitle:
            self._place(sub[0], MARGIN, Inches(4.3), W - 2 * MARGIN, Inches(1.0))
            sub[0].text_frame.text = subtitle
            sub[0].text_frame.paragraphs[0].alignment = PP_ALIGN.LEFT
            for r in sub[0].text_frame.paragraphs[0].runs:
                self._style(r, 22, color=self.muted)
        elif sub:
            sub[0]._element.getparent().remove(sub[0]._element)
        self._notes(s, notes)
        return s

    def section(self, title, subtitle=None, notes=None):
        return self.title(title, subtitle, notes)

    def bullets(self, title, items, notes=None, size=24):
        s = self.prs.slides.add_slide(self._layout("Title and Content", 1))
        self._title(s, title)
        body = [p for p in s.placeholders if p.placeholder_format.idx == 1][0]
        self._place(body, MARGIN, BODY_TOP, W - 2 * MARGIN, BODY_H)
        self._lines(body.text_frame, items, size)
        self._notes(s, notes)
        return s

    def two_columns(self, title, left, right, left_title=None, right_title=None, notes=None, size=22):
        s = self.prs.slides.add_slide(self._layout("Title Only", 5))
        self._title(s, title)
        gap = Inches(0.5)
        col = (W - 2 * MARGIN - gap) / 2
        for i, (items, head) in enumerate(((left, left_title), (right, right_title))):
            x = MARGIN + i * (col + gap)
            top = BODY_TOP
            if head:
                hb = self._textbox(s, x, top, col, Inches(0.6))
                hb.text_frame.text = head
                for r in hb.text_frame.paragraphs[0].runs:
                    self._style(r, size + 2, bold=True, color=self.accent)
                top += Inches(0.7)
            box = self._textbox(s, x, top, col, BODY_H - (top - BODY_TOP))
            self._lines(box.text_frame, items, size)
        self._notes(s, notes)
        return s

    def image(self, title, path, caption=None, notes=None):
        from PIL import Image

        s = self.prs.slides.add_slide(self._layout("Title Only", 5))
        self._title(s, title)
        room_h = BODY_H - (Inches(0.5) if caption else 0)
        room_w = W - 2 * MARGIN
        with Image.open(path) as im:
            iw, ih = im.size
        scale = min(room_w / iw, room_h / ih)
        w, h = int(iw * scale), int(ih * scale)
        pic = s.shapes.add_picture(path, int(MARGIN + (room_w - w) / 2), int(BODY_TOP), w, h)
        pic._element.nvPicPr.cNvPr.set("descr", caption or title)
        if caption:
            cb = self._textbox(s, MARGIN, BODY_TOP + h + Inches(0.1), room_w, Inches(0.45))
            cb.text_frame.text = caption
            cb.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
            for r in cb.text_frame.paragraphs[0].runs:
                self._style(r, 14, color=self.muted)
        self._notes(s, notes)
        return s

    def table(self, title, rows, notes=None, size=None):
        s = self.prs.slides.add_slide(self._layout("Title Only", 5))
        self._title(s, title)
        n_rows, n_cols = len(rows), max(len(r) for r in rows)
        size = size or (18 if n_rows <= 6 else 14 if n_rows <= 12 else 11)
        row_h = Pt(size * 2.1)
        shape = s.shapes.add_table(n_rows, n_cols, int(MARGIN), int(BODY_TOP), int(W - 2 * MARGIN), int(row_h * n_rows))
        t = shape.table
        for i, row in enumerate(rows):
            for j in range(n_cols):
                cell = t.cell(i, j)
                cell.text = str(row[j]) if j < len(row) else ""
                for p in cell.text_frame.paragraphs:
                    for r in p.runs:
                        self._style(r, size, bold=i == 0, color="FFFFFF" if i == 0 else self.ink)
                if i == 0:
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = _rgb(self.accent)
        self._notes(s, notes)
        return s

    def chart(self, title, categories, series, kind="column", notes=None):
        s = self.prs.slides.add_slide(self._layout("Title Only", 5))
        self._title(s, title)
        data = CategoryChartData()
        data.categories = list(categories)
        for name, values in series.items():
            data.add_series(name, list(values))
        gf = s.shapes.add_chart(CHARTS.get(kind, XL_CHART_TYPE.COLUMN_CLUSTERED), int(MARGIN), int(BODY_TOP), int(W - 2 * MARGIN), int(BODY_H), data)
        ch = gf.chart
        ch.has_legend = len(series) > 1 or kind == "pie"
        if ch.has_legend:
            ch.legend.position = XL_LEGEND_POSITION.BOTTOM
            ch.legend.include_in_layout = False
        ch.font.size = Pt(14)
        ch.font.name = self.font
        if kind != "pie":
            for i, plot_series in enumerate(ch.plots[0].series):
                fill = plot_series.format.fill
                fill.solid()
                fill.fore_color.rgb = _rgb(self.accent if i == 0 else ["8B949E", "F0883E", "3FB950", "A371F7"][(i - 1) % 4])
        ch.has_title = False
        self._notes(s, notes)
        return s

    def text(self, title, paragraphs, notes=None, size=22):
        """Plain paragraphs, no bullets."""
        s = self.prs.slides.add_slide(self._layout("Title Only", 5))
        self._title(s, title)
        box = self._textbox(s, MARGIN, BODY_TOP, W - 2 * MARGIN, BODY_H)
        self._lines(box.text_frame, list(paragraphs), size, bullets=False)
        self._notes(s, notes)
        return s

    def save(self, path):
        self.prs.save(path)
        return path
