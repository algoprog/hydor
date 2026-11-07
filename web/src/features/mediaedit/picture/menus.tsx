// The picture editor's menus, as Photoshop has them: File, Edit, Image, Layer, Select, Filter, View and AI, each action
// with its keys beside it (the keys work wherever the editor is: shell/menus.ts), what does not apply greyed. Filters and
// adjustments go on adjustment layers, so each can be changed or taken away later.
import { BLEND_MODES } from '@shared/blend';
import { FILTERS, type LookSettings } from '@shared/mediaedit';
import { Copy, Crop, Download, FlipHorizontal2, ImagePlus, Keyboard, Layers2, Maximize, Redo2, RotateCcw, RotateCw, Save, Scissors, SlidersHorizontal, Sparkles, Trash2, Undo2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { viaLink } from '../../../lib/machine';
import type { MenuDef } from '../shell';
import { activeLayer, indexOf } from './doc';
import type { PictureEd } from './editor';

export interface MenuUi {
  openFile(): void;
  openLibrary(): void;
  fromClipboard(): void;
  save(which: 'main' | 'copy'): void;
  saveOptions(): void;
  canCopy: boolean;
  saveLabel: string;
  copyLabel: string | null;
  exportAs(f: 'png' | 'jpeg' | 'webp'): void;
  backToOriginal(): void;
  close(): void;
  imageSize(): void;
  canvasSize(): void;
  amount(kind: 'feather' | 'grow' | 'shrink' | 'stroke'): void;
  shortcuts(): void;
  /** The Adjustments panel, a section of it open. */
  adjust(section: string): void;
}

export function buildMenus(ed: PictureEd, ui: MenuUi): MenuDef[] {
  const d = ed.doc;
  const l = activeLayer(d);
  const sel = !!d.sel;
  const raster = l?.kind === 'raster';
  const i = l ? indexOf(d, l.id) : -1;
  const newLook = (look: LookSettings, name: string) => () => (ed.newAdjustment(look, name), ed.showPanel('properties'));
  return [
    {
      label: 'File',
      items: [
        { label: 'Open a picture as a layer…', icon: <ImagePlus size={14} />, keys: 'Ctrl+O', run: ui.openFile },
        { label: 'A picture from the Library as a layer…', icon: <Layers2 size={14} />, run: ui.openLibrary },
        { label: 'A picture from the clipboard as a layer', run: ui.fromClipboard },
        '-',
        { label: ui.saveLabel, icon: <Save size={14} />, keys: 'Ctrl+S', run: () => ui.save('main') },
        ui.copyLabel ? { label: ui.copyLabel, run: () => ui.save('copy') } : null,
        { label: 'How it is saved…', run: ui.saveOptions },
        {
          label: 'Export as',
          icon: <Download size={14} />,
          items: [
            { label: 'PNG, to this device', run: () => ui.exportAs('png') },
            { label: 'JPEG, to this device', run: () => ui.exportAs('jpeg') },
            { label: 'WebP, to this device', run: () => ui.exportAs('webp') },
          ],
        },
        '-',
        { label: 'Back to the original', icon: <RotateCcw size={14} />, disabled: ed.untouched, run: ui.backToOriginal },
        { label: 'Close', run: ui.close },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', icon: <Undo2 size={14} />, keys: 'Ctrl+Z', disabled: !ed.hist.canUndo, run: () => ed.undo() },
        { label: 'Redo', icon: <Redo2 size={14} />, keys: 'Ctrl+Shift+Z / Ctrl+Y', disabled: !ed.hist.canRedo, run: () => ed.redo() },
        '-',
        { label: 'Cut', icon: <Scissors size={14} />, keys: 'Ctrl+X', disabled: !sel || !raster, run: () => ed.cut() },
        { label: 'Copy', icon: <Copy size={14} />, keys: 'Ctrl+C', disabled: !l, run: () => ed.copy(false) },
        { label: 'Copy what shows', keys: 'Ctrl+Shift+C', also: 'copy merged', run: () => ed.copy(true) },
        { label: 'Paste', keys: 'Ctrl+V', run: () => ed.pasteHere() },
        { label: 'Clear', icon: <Trash2 size={14} />, keys: 'Delete', also: 'delete erase selected', disabled: !sel && !(l && l.kind !== 'raster'), run: () => ed.deleteKey() },
        '-',
        {
          label: 'Fill',
          items: [
            { label: 'With the foreground colour', keys: 'Alt+Delete', run: () => ed.fill(ed.fg) },
            { label: 'With the background colour', keys: 'Ctrl+Delete', run: () => ed.fill(ed.bg) },
            { label: 'With white', run: () => ed.fill('#ffffff') },
            { label: 'With black', run: () => ed.fill('#000000') },
          ],
        },
        { label: 'Stroke the selection…', disabled: !sel, run: () => ui.amount('stroke') },
        '-',
        { label: 'Free transform', keys: 'Ctrl+T', also: 'scale rotate resize move', disabled: !l || l.kind === 'adjust', run: () => ed.startTransform() },
        '-',
        { label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, keys: 'Ctrl+/', run: ui.shortcuts },
      ],
    },
    {
      label: 'Image',
      items: [
        {
          label: 'Adjustments',
          icon: <SlidersHorizontal size={14} />,
          items: [
            { label: 'Brightness and contrast…', run: () => ui.adjust('light') },
            { label: 'Levels…', keys: 'Ctrl+L', run: () => ui.adjust('levels') },
            { label: 'Curves…', keys: 'Ctrl+M', run: () => ui.adjust('curves') },
            { label: 'Hue and saturation…', keys: 'Ctrl+U', run: () => ui.adjust('hsl') },
            { label: 'Colour balance…', run: () => ui.adjust('balance') },
            { label: 'Vibrance and warmth…', run: () => ui.adjust('colour') },
            '-',
            { label: 'Black and white', run: newLook({ filter: { id: 'mono' } }, 'Black and white') },
            { label: 'Invert', keys: 'Ctrl+I', run: newLook({ invert: true }, 'Invert') },
            { label: 'Posterize…', run: () => ui.adjust('effects') },
            { label: 'Threshold…', run: () => ui.adjust('effects') },
          ],
        },
        { label: 'Auto enhance', icon: <Wand2 size={14} />, keys: 'Ctrl+Shift+B', run: () => ed.autoEnhance() },
        '-',
        { label: 'Image size…', keys: 'Ctrl+Alt+I', run: ui.imageSize },
        { label: 'Canvas size…', keys: 'Ctrl+Alt+C', run: ui.canvasSize },
        '-',
        { label: 'Crop', icon: <Crop size={14} />, run: () => ed.setTool('crop') },
        { label: 'Crop to the selection', disabled: !sel, run: () => ed.cropToSelection() },
        '-',
        { label: 'Turn left', icon: <RotateCcw size={14} />, run: () => ed.turn(-1) },
        { label: 'Turn right', icon: <RotateCw size={14} />, run: () => ed.turn(1) },
        { label: 'Mirror', icon: <FlipHorizontal2 size={14} />, run: () => ed.flip('h') },
        { label: 'Upside down', run: () => ed.flip('v') },
      ],
    },
    {
      label: 'Layer',
      items: [
        { label: 'New layer', keys: 'Ctrl+Shift+N', run: () => ed.newLayer() },
        { label: 'New adjustment layer', run: () => (ed.newAdjustment(), ui.adjust('light')) },
        { label: sel ? 'Layer via copy' : 'Duplicate layer', keys: 'Ctrl+J', disabled: !l, run: () => ed.duplicateLayer() },
        { label: 'Layer via cut', keys: 'Ctrl+Shift+J', disabled: !sel || !raster, run: () => ed.layerViaCopy(true) },
        { label: 'Delete layer', disabled: !l || d.layers.length < 2, run: () => ed.deleteLayer() },
        '-',
        { label: 'Merge down', keys: 'Ctrl+E', disabled: i < 1, run: () => ed.mergeDown() },
        { label: 'Merge visible', keys: 'Ctrl+Shift+E', disabled: d.layers.length < 2, run: () => ed.mergeVisible() },
        { label: 'Flatten', disabled: d.layers.length < 2, run: () => ed.flatten() },
        '-',
        {
          label: 'Blend mode',
          disabled: !l,
          items: BLEND_MODES.map((m) => ({ label: m.label, checked: l?.blend === m.id, run: () => l && ed.setLayer(l.id, { blend: m.id }, 'Blend mode') })),
        },
        {
          label: 'Opacity',
          disabled: !l,
          items: [100, 75, 50, 25].map((p) => ({ label: `${p}%`, checked: Math.round((l?.opacity ?? 1) * 100) === p, run: () => l && ed.setLayer(l.id, { opacity: p / 100 }, 'Opacity') })),
        },
        {
          label: 'Arrange',
          disabled: !l,
          items: [
            { label: 'Bring to the front', keys: 'Ctrl+Shift+]', run: () => ed.arrange('front') },
            { label: 'Bring forward', keys: 'Ctrl+]', run: () => ed.arrange('forward') },
            { label: 'Send backward', keys: 'Ctrl+[', run: () => ed.arrange('backward') },
            { label: 'Send to the back', keys: 'Ctrl+Shift+[', run: () => ed.arrange('back') },
          ],
        },
        '-',
        { label: l?.visible === false ? 'Show the layer' : 'Hide the layer', disabled: !l, run: () => l && ed.setLayer(l.id, { visible: !l.visible }, l.visible ? 'Hide layer' : 'Show layer') },
        { label: l?.locked ? 'Unlock the layer' : 'Lock the layer', disabled: !l, run: () => l && ed.setLayer(l.id, { locked: !l.locked }, l.locked ? 'Unlock layer' : 'Lock layer') },
      ],
    },
    {
      label: 'Select',
      items: [
        { label: 'All', keys: 'Ctrl+A', run: () => ed.selectAll() },
        { label: 'Deselect', keys: 'Ctrl+D', disabled: !sel, run: () => ed.deselect() },
        { label: 'Reselect', keys: 'Ctrl+Shift+D', disabled: !ed.lastSel, run: () => ed.reselect() },
        { label: 'Invert', keys: 'Ctrl+Shift+I', run: () => ed.invertSelection() },
        '-',
        ...(viaLink ? [] : [{ label: 'Subject', icon: <Sparkles size={14} />, also: 'select subject person object ai', run: () => ed.askAi('subject') }]),
        { label: 'The layer’s pixels', disabled: !l || l.kind === 'adjust', run: () => ed.selectLayerPixels() },
        '-',
        { label: 'Feather…', keys: 'Shift+F6', disabled: !sel, run: () => ui.amount('feather') },
        { label: 'Grow…', disabled: !sel, run: () => ui.amount('grow') },
        { label: 'Shrink…', disabled: !sel, run: () => ui.amount('shrink') },
      ],
    },
    {
      label: 'Filter',
      items: [
        { label: 'Looks', items: FILTERS.map((f) => ({ label: f.label, run: newLook({ filter: { id: f.id } }, f.label) })) },
        '-',
        { label: 'Blur…', run: () => ui.adjust('detail') },
        { label: 'Sharpen…', run: () => ui.adjust('detail') },
        { label: 'Noise reduction…', run: () => ui.adjust('detail') },
        { label: 'Clarity…', run: () => ui.adjust('detail') },
        { label: 'Dehaze…', run: () => ui.adjust('detail') },
        { label: 'Grain…', run: () => ui.adjust('effects') },
        { label: 'Vignette…', run: () => ui.adjust('effects') },
        '-',
        { label: 'Blur an area', run: () => ed.setTool('hide-blur') },
        { label: 'Pixelate an area', run: () => ed.setTool('hide-pixelate') },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom in', icon: <ZoomIn size={14} />, keys: 'Ctrl+=', run: () => ed.view?.zoomBy(1.25) },
        { label: 'Zoom out', icon: <ZoomOut size={14} />, keys: 'Ctrl+-', run: () => ed.view?.zoomBy(0.8) },
        { label: 'Fit on screen', icon: <Maximize size={14} />, keys: 'Ctrl+0', run: () => ed.view?.fit() },
        { label: 'Actual size', keys: 'Ctrl+1', run: () => ed.view?.actual() },
        '-',
        { label: 'Rulers', keys: 'Ctrl+R', checked: ed.rulers, run: () => ((ed.rulers = !ed.rulers), ed.emit(false)) },
        { label: 'Grid', keys: "Ctrl+'", checked: ed.grid, run: () => ((ed.grid = !ed.grid), ed.emit(false)) },
        { label: 'Guides', keys: 'Ctrl+;', checked: ed.showGuides, run: () => ((ed.showGuides = !ed.showGuides), ed.emit(false)) },
        { label: 'Clear the guides', disabled: !ed.guides.v.length && !ed.guides.h.length, run: () => ((ed.guides = { v: [], h: [] }), ed.emit(false)) },
      ],
    },
    // At someone's link, no AI tools (they spend the owner's money or their computer's time).
    ...(viaLink
      ? []
      : [
          {
            label: 'AI',
            items: [
              { label: 'Remove the background', run: () => ed.askAi('cutout') },
              { label: 'Erase…', run: () => ed.askAi('erase') },
              { label: 'Change with AI…', also: 'generative fill', run: () => ed.askAi('change') },
              { label: 'Expand the picture…', also: 'generative expand outpaint', run: () => ed.askAi('expand') },
              { label: 'Make it larger…', also: 'upscale super resolution enlarge', run: () => ed.askAi('upscale') },
              { label: 'Select the subject', run: () => ed.askAi('subject') },
            ],
          },
        ]),
  ];
}

/** The keys that are not in the menus, for the list of shortcuts. */
export const MORE_KEYS = [
  {
    title: 'Tools',
    items: [
      ['V', 'Move'],
      ['M', 'Rectangle or ellipse select'],
      ['L', 'Lasso or polygon lasso'],
      ['W', 'Magic wand'],
      ['C', 'Crop'],
      ['I', 'Eyedropper'],
      ['J', 'Spot healing brush'],
      ['B', 'Brush'],
      ['S', 'Clone stamp'],
      ['E', 'Eraser'],
      ['G', 'Gradient or paint bucket'],
      ['O', 'Dodge or burn'],
      ['T', 'Text'],
      ['U', 'Shapes'],
      ['H', 'Hand'],
      ['Z', 'Zoom'],
    ] as [string, string][],
  },
  {
    title: 'Working',
    items: [
      ['[ / ]', 'Brush size smaller or larger'],
      ['X', 'Swap the foreground and background colours'],
      ['D', 'Default colours (black and white)'],
      ['Space', 'Hold and drag to move around'],
      ['Alt', 'Click with the clone stamp: where to copy from'],
      ['Shift', 'With a marquee or lasso: add to the selection'],
      ['Alt', 'With a marquee or lasso: take away from the selection'],
      ['Enter', 'Apply the crop or the free transform'],
      ['Esc', 'Cancel the crop or the free transform'],
      ['Arrow keys', 'Move the picked layer a pixel (with Shift, ten)'],
    ] as [string, string][],
  },
];
