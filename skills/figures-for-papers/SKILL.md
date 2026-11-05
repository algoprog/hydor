---
name: figures-for-papers
description: Use when making or fixing a paper's or a thesis's figures with matplotlib, seaborn or plotly (their size from the column width, the paper's font, colour-blind-safe colours, vector PDFs with embedded fonts, one style file), or when a venue rejects Type 3 fonts.
category: research
triggers: [figures for the paper, figure for my paper, plots for the paper, plots for my paper, camera-ready figures, type 3 fonts, columnwidth, mplstyle, matplotlib figure size, pdffonts]
---

# Figures fit for a paper

A figure made at the size it is printed, in the paper's font, keeps its text the size of the
caption's and its lines crisp; scaled down in LaTeX, it shrinks to unreadable. Make each figure as
wide as the column (or the page) it fills, set its text in the paper's font, use colours that
everyone tells apart, save it as a vector PDF with its fonts embedded, and do it all with one style
file for the whole paper. The widths of the common templates are in `references/widths.md`.

## 1. The width it is printed at

- One column (`\columnwidth`) or the page (`\textwidth`): read it from the template
  (`references/widths.md`), or ask LaTeX: put `\showthe\columnwidth` in the document and read the
  log; points to inches: divide by 72.27.
- Make the figure that wide (`figsize=(width, height)` in inches) and include it at its own size:
  `\includegraphics{fig.pdf}`, or `[width=\columnwidth]` when it was made at that width (no
  scaling). Never make it big and shrink it.
- Height as its content needs: about 0.62 of the width for one plot in a column; less across the
  page. Panels side by side share their axes (`sharey=True`) and their legend.

## 2. The paper's font

- Match the paper: Times (ACL, EMNLP, NAACL, IEEE, ICML, NeurIPS, ICLR), Linux Libertine (ACM),
  Computer Modern (LaTeX's default, Springer LNCS). Text in the figure at 7 to 9 pt, as the
  caption is.
- Without LaTeX: `font.family: serif` with the font named (`font.serif: Times New Roman, Times,
  Nimbus Roman, TeX Gyre Termes`) and maths to match (`mathtext.fontset: stix` for Times, `cm` for
  Computer Modern). Check the font is installed (`fc-list | grep -i times`): matplotlib falls back
  to another with only a warning.
- `text.usetex: True` sets every label with LaTeX itself: an exact match, but slow and it needs a
  TeX installation; use it when the figure's maths must look like the paper's.

## 3. Vector, with its fonts embedded

- `pdf.fonttype: 42` and `ps.fonttype: 42`: TrueType fonts in the PDF. The default (Type 3) is
  what venues and arXiv complain about.
- Save plots as PDF (`fig.savefig('name.pdf')`), never as PNG or JPEG; `bbox_inches='tight'` with
  a small `pad_inches`. A scatter of 100,000 points: `rasterized=True` on that layer alone, with
  `dpi=300`, and the axes and text stay vector.
- Check every figure, then the whole paper: `pdffonts fig.pdf` lists each font with its type and
  whether it is embedded: all `emb yes`, none `Type 3`.

## 4. Colours everyone tells apart

- Okabe and Ito's palette for categories: `#0072B2` blue, `#E69F00` orange, `#009E73` green,
  `#D55E00` vermilion, `#CC79A7` purple, `#56B4E9` sky blue, `#F0E442` yellow, `#000000` black.
  `viridis` or `cividis` for a scale; a diverging map (`RdBu`) around a meaningful zero.
- Never red against green alone; tell lines apart by their style and markers too, so the figure
  reads in grey and on a projector.
- The same method has the same colour in every figure of the paper.

## 5. One style file for the paper

`paper.mplstyle`, beside the scripts, used by each of them (`plt.style.use('paper.mplstyle')`):

```
figure.figsize : 3.03, 1.88
savefig.format : pdf
savefig.bbox : tight
savefig.pad_inches : 0.02
pdf.fonttype : 42
ps.fonttype : 42
font.family : serif
font.serif : Times New Roman, Times, Nimbus Roman, TeX Gyre Termes, DejaVu Serif
mathtext.fontset : stix
font.size : 8
axes.labelsize : 8
xtick.labelsize : 7
ytick.labelsize : 7
legend.fontsize : 7
legend.frameon : False
axes.spines.top : False
axes.spines.right : False
axes.linewidth : 0.6
lines.linewidth : 1.2
axes.prop_cycle : cycler('color', ['0072B2', 'E69F00', '009E73', 'D55E00', 'CC79A7', '56B4E9', 'F0E442', '000000'])
```

In a style file `#` starts a comment, so colours go without it. Take out what the scripts set
themselves (sizes, fonts, colours) so the style decides; keep a figure's own exceptions few.

## 6. Seaborn and plotly

- Seaborn: `sns.set_theme()` resets matplotlib's settings; call `plt.style.use('paper.mplstyle')`
  after it, or use `sns.set_style('ticks')` and `sns.set_palette(...)` alone.
- Plotly: `fig.update_layout(width=w*96, height=h*96, font_family='Times New Roman', font_size=10)`
  and `fig.write_image('fig.pdf')` (kaleido); check its fonts with `pdffonts` too.

## 7. Change scripts safely

- Keep the originals before changing anything (`plot.orig.py`, or a commit), and render each figure
  as it was (`pdftoppm -png -r 150 -singlefile fig.pdf before`) to compare.
- Run the scripts in their own environment; when their data is not here, say so rather than
  inventing it.
- After: render the new PDFs the same way and look at both side by side: nothing cut off, no text
  overlapping, legends clear of the data.

## Pitfalls

- A title inside the figure that repeats the caption: drop it, the caption says it.
- Text under 6 pt, or a figure scaled in LaTeX so its text is.
- `tight_layout` fighting a fixed size: `constrained_layout` (`figure.constrained_layout.use: True`)
  keeps the size and fits the labels.
- Too many ticks and digits; units missing from the axes.
- A legend that hides data, or a key to look up where direct labels would do.
