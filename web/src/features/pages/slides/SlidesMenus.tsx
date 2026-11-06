// The slides editor's menus, as Google Slides and PowerPoint have them: Edit, View (zoom, the grid, the rulers and
// guides), Insert (every kind of part, pictures, drawings, plots and videos made with AI, the web format's interactive
// parts, a comment), Format (the words' look, the format painter, a picture's crop and its changes with AI, a chart
// made a plot, running a live part in place), Arrange (groups, the stacking order, lining up, turning), Slide, and Tools
// (PowerPoint compatible or the web format too, which the Theme tab has beside the slides' shape). Each action with its
// keys; what does not apply to what is picked is greyed. Search the menus (Alt+/) finds any of them.
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  ChartScatter,
  Box,
  CircleStop,
  Clipboard,
  CodeXml,
  Copy,
  CornerDownRight,
  Crop,
  Eraser,
  Eye,
  Globe,
  Grid3x3,
  Group,
  ImageDown,
  Image as ImageIcon,
  ImageMinus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Keyboard,
  LayoutTemplate,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  MessageSquarePlus,
  MonitorPlay,
  MousePointerClick,
  MoveRight,
  Paintbrush,
  PenTool,
  PieChart,
  Play,
  Plus,
  Presentation,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  RotateCw,
  Ruler,
  Scissors,
  Search,
  Shapes,
  Sigma,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Spline,
  SquareCode,
  Star,
  Strikethrough,
  Table2,
  Trash2,
  Trophy,
  Type,
  Underline,
  Undo2,
  Ungroup,
  Video,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { keptVideo, type El, type ElType } from '@shared/slides';
import type { MenuDef } from '../common/menus';
import type { AlignHow } from './ops';
import type { TextActions } from './TextBar';

/** The web format's parts Insert → Interactive puts on a slide. */
export type RichKind = Extract<ElType, 'html' | 'embed' | 'quiz' | 'score' | 'scene3d'>;

export interface MenuArgs {
  readOnly?: boolean;
  /** The deck is in the web format (not PowerPoint compatible). */
  web: boolean;
  /** PowerPoint compatible on (asked first, with what changes) or off. */
  setCompatible(on: boolean): void;
  wide: boolean;
  pageLayout: boolean;
  picked: El[];
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  hasLook: boolean;
  painting: boolean;
  zoom: number | 'fit';
  grid: { show: boolean; snap: boolean; size: number };
  rulers: boolean;
  notesOpen: boolean;
  gridView: boolean;
  hidden: boolean;
  text: TextActions | null;
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  duplicate(): void;
  remove(): void;
  selectAll(): void;
  find(replace?: boolean): void;
  copyLook(): void;
  pasteLook(): void;
  painter(): void;
  setZoom(z: number | 'fit'): void;
  zoomBy(f: number): void;
  setGrid(g: Partial<{ show: boolean; snap: boolean; size: number }>): void;
  setRulers(on: boolean): void;
  addGuide(axis: 'x' | 'y'): void;
  clearGuides(): void;
  hasGuides: boolean;
  setNotes(on: boolean): void;
  setGridView(on: boolean): void;
  newSlide(): void;
  textBox(): void;
  shape(): void;
  picture(): void;
  pictureUrl(): void;
  line(arrow: boolean): void;
  /** A connector: straight or elbowed, between the two parts picked or free. */
  connector(elbow: boolean): void;
  table(): void;
  chart(): void;
  icon(): void;
  emoji(): void;
  equation(): void;
  /** Code shown with its colours (both formats). */
  code(): void;
  /** One of the web format's parts (in a PowerPoint compatible deck, asked first). */
  rich(kind: RichKind): void;
  /** The live part picked runs in place, or stops. */
  running: boolean;
  run(): void;
  /** The AI tools: a picture made with AI, a drawing (SVG), a plot, a video; the picture picked changed; the chart picked made a plot. */
  aiPicture?: () => void;
  aiDrawing?: () => void;
  aiPlot?: () => void;
  aiVideo?: () => void;
  aiEdit?: (mode: 'change' | 'cutout' | 'erase') => void;
  /** The picture picked in the picture editor, in a tab of its own. */
  editPicture?: () => void;
  aiPlotChart?: () => void;
  /** The video picked (one the app keeps) in the video editor, in a tab of its own. */
  editVideo?: () => void;
  video(): void;
  /** A video from this device. */
  videoFile(): void;
  footer(): void;
  /** A comment on what is picked, or on the slide. */
  comment(): void;
  crop(): void;
  resetPicture(): void;
  editTex(): void;
  replaceIcon(): void;
  formatPanel(): void;
  group(): void;
  ungroup(): void;
  restack(how: 'front' | 'back' | 'forward' | 'backward'): void;
  align(how: AlignHow): void;
  spread(axis: 'h' | 'v'): void;
  turn(by: number): void;
  flip(axis: 'h' | 'v'): void;
  lock(): void;
  duplicateSlide(): void;
  deleteSlide(): void;
  skipSlide(): void;
  openTab(t: 'slide' | 'animate' | 'theme'): void;
  /** This slide as a picture (PNG). */
  slidePicture?: () => void;
  present(from: 'start' | 'here' | 'presenter'): void;
  shortcuts(): void;
  ask?: () => void;
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

export function slidesMenus(a: MenuArgs): MenuDef[] {
  const n = a.picked.length;
  const one = n === 1 ? a.picked[0] : null;
  const ro = !!a.readOnly;
  const t = a.text;
  const many = n > 1;
  const live = one?.type === 'html' || one?.type === 'embed' || one?.type === 'scene3d';
  return [
    {
      label: 'Edit',
      items: [
        { label: 'Undo', icon: <Undo2 size={14} />, keys: 'Ctrl+Z', disabled: ro || !a.canUndo, run: a.undo },
        { label: 'Redo', icon: <Redo2 size={14} />, keys: 'Ctrl+Shift+Z', disabled: ro || !a.canRedo, run: a.redo },
        '-',
        { label: 'Cut', icon: <Scissors size={14} />, keys: 'Ctrl+X', disabled: ro || !n, run: a.cut },
        { label: 'Copy', icon: <Copy size={14} />, keys: 'Ctrl+C', disabled: !n, run: a.copy },
        { label: 'Paste', icon: <Clipboard size={14} />, keys: 'Ctrl+V', disabled: ro || !a.canPaste, run: a.paste },
        { label: 'Duplicate', icon: <Copy size={14} />, keys: 'Ctrl+D', disabled: ro || !n, run: a.duplicate },
        { label: 'Delete', icon: <Trash2 size={14} />, keys: 'Delete', disabled: ro || !n, run: a.remove },
        '-',
        { label: 'Select all', keys: 'Ctrl+A', run: a.selectAll },
        { label: 'Find and replace', icon: <Search size={14} />, keys: 'Ctrl+H', also: 'find search replace words', run: () => a.find(!ro) },
        '-',
        { label: 'Copy the look', icon: <Paintbrush size={14} />, keys: 'Ctrl+Shift+C', also: 'copy format style formatting', disabled: !one, run: a.copyLook },
        { label: 'Paste the look', keys: 'Ctrl+Shift+V', also: 'paste format style formatting', disabled: ro || !n || !a.hasLook, run: a.pasteLook },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Zoom',
          icon: <ZoomIn size={14} />,
          items: [
            { label: 'Fit the slide', keys: 'Ctrl+Alt+0', checked: a.zoom === 'fit', also: 'zoom whole', run: () => a.setZoom('fit') },
            ...ZOOMS.map((z) => ({ label: `${z * 100}%`, checked: a.zoom === z, also: 'zoom', run: () => a.setZoom(z) })),
            '-',
            { label: 'Zoom in', icon: <ZoomIn size={14} />, keys: 'Ctrl+Alt+=', run: () => a.zoomBy(1.25) },
            { label: 'Zoom out', icon: <ZoomOut size={14} />, keys: 'Ctrl+Alt+-', run: () => a.zoomBy(0.8) },
          ],
        },
        '-',
        { label: 'Show grid', icon: <Grid3x3 size={14} />, checked: a.grid.show, run: () => a.setGrid({ show: !a.grid.show }) },
        { label: 'Snap to grid', checked: a.grid.snap, also: 'grid magnet', run: () => a.setGrid({ snap: !a.grid.snap }) },
        { label: 'Grid size', items: [10, 20, 40, 80].map((s) => ({ label: `${s} px`, checked: a.grid.size === s, also: 'grid size spacing', run: () => a.setGrid({ size: s }) })) },
        '-',
        { label: 'Rulers and guides', icon: <Ruler size={14} />, checked: a.rulers, also: 'ruler guide', run: () => a.setRulers(!a.rulers) },
        {
          label: 'Guides',
          items: [
            { label: 'Add a guide across', also: 'horizontal guide', disabled: ro, run: () => a.addGuide('y') },
            { label: 'Add a guide down', also: 'vertical guide', disabled: ro, run: () => a.addGuide('x') },
            '-',
            { label: 'Remove every guide', danger: true, disabled: ro || !a.hasGuides, run: a.clearGuides },
          ],
        },
        '-',
        a.wide && { label: 'Speaker notes', checked: a.notesOpen, run: () => a.setNotes(!a.notesOpen) },
        a.pageLayout && { label: 'Every slide', icon: <Eye size={14} />, checked: a.gridView, also: 'slide sorter grid overview', run: () => a.setGridView(!a.gridView) },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: 'New slide', icon: <LayoutTemplate size={14} />, keys: 'Ctrl+M', disabled: ro, run: a.newSlide },
        '-',
        { label: 'Text box', icon: <Type size={14} />, disabled: ro, run: a.textBox },
        { label: 'Shape', icon: <Shapes size={14} />, disabled: ro, run: a.shape },
        {
          label: 'Picture',
          icon: <ImageIcon size={14} />,
          disabled: ro,
          items: [
            { label: 'From this device', also: 'picture image upload', run: a.picture },
            { label: 'From a web address', also: 'picture image url', run: a.pictureUrl },
            !!a.aiPicture && '-',
            !!a.aiPicture && { label: 'Make with AI', icon: <WandSparkles size={14} />, also: 'picture image generate ai photo illustration icon background', run: a.aiPicture },
            !!a.aiDrawing && { label: 'Drawing (SVG)', icon: <PenTool size={14} />, also: 'svg vector drawing icon logo diagram illustration ai', run: a.aiDrawing },
          ],
        },
        {
          label: 'Line or arrow',
          icon: <MoveRight size={14} />,
          disabled: ro,
          items: [
            { label: 'Straight line', run: () => a.line(false) },
            { label: 'Arrow', run: () => a.line(true) },
            '-',
            { label: 'Straight connector', icon: <Spline size={14} />, also: 'connector join link shapes flowchart', run: () => a.connector(false) },
            { label: 'Elbow connector', icon: <CornerDownRight size={14} />, also: 'connector elbow bent join link shapes flowchart', run: () => a.connector(true) },
          ],
        },
        { label: 'Table', icon: <Table2 size={14} />, disabled: ro, run: a.table },
        { label: 'Chart', icon: <PieChart size={14} />, disabled: ro, run: a.chart },
        !!a.aiPlot && { label: 'Plot', icon: <ChartScatter size={14} />, also: 'plot chart graph data matplotlib histogram scatter ai', disabled: ro, run: a.aiPlot },
        '-',
        { label: 'Icon', icon: <Star size={14} />, also: 'icon symbol pictogram lucide', disabled: ro, run: a.icon },
        { label: 'Emoji', icon: <Smile size={14} />, also: 'emoji smiley', disabled: ro, run: a.emoji },
        { label: 'Equation', icon: <Sigma size={14} />, also: 'equation maths formula latex', disabled: ro, run: a.equation },
        { label: 'Code', icon: <SquareCode size={14} />, also: 'code program snippet source syntax colours', disabled: ro, run: a.code },
        {
          label: 'Video',
          icon: <Video size={14} />,
          disabled: ro,
          items: [
            { label: 'From YouTube or Vimeo', also: 'video youtube vimeo online address link', run: a.video },
            { label: 'From this device', also: 'video file upload mp4 mov webm film clip', run: a.videoFile },
            !!a.aiVideo && '-',
            !!a.aiVideo && { label: 'Make with AI', icon: <WandSparkles size={14} />, also: 'video generate ai clip film', run: a.aiVideo },
          ],
        },
        {
          label: 'Interactive',
          icon: <MousePointerClick size={14} />,
          also: 'web format interactive',
          disabled: ro,
          items: [
            { label: 'Custom code', icon: <CodeXml size={14} />, also: 'html css javascript code widget page', run: () => a.rich('html') },
            { label: 'Web page', icon: <Globe size={14} />, also: 'embed website frame map form codepen address', run: () => a.rich('embed') },
            { label: 'Quiz', icon: <ListChecks size={14} />, also: 'quiz question poll choices test answer', run: () => a.rich('quiz') },
            { label: 'Quiz score', icon: <Trophy size={14} />, also: 'quiz score points result right answers', run: () => a.rich('score') },
            { label: '3D', icon: <Box size={14} />, also: '3d model glb gltf shape turn three', run: () => a.rich('scene3d') },
          ],
        },
        '-',
        { label: 'Comment', icon: <MessageSquarePlus size={14} />, keys: 'Ctrl+Alt+M', also: 'comment note review feedback', disabled: ro, run: a.comment },
      ],
    },
    {
      label: 'Format',
      items: [
        { label: 'Format painter', icon: <Paintbrush size={14} />, checked: a.painting, also: 'copy formatting look style', disabled: ro || (!one && !a.painting), run: a.painter },
        '-',
        t && {
          label: 'Text',
          icon: <Type size={14} />,
          items: [
            { label: 'Bold', icon: <Bold size={14} />, keys: 'Ctrl+B', checked: t.on('bold'), run: () => t.toggle('bold') },
            { label: 'Italic', icon: <Italic size={14} />, keys: 'Ctrl+I', checked: t.on('italic'), run: () => t.toggle('italic') },
            { label: 'Underline', icon: <Underline size={14} />, keys: 'Ctrl+U', checked: t.on('underline'), run: () => t.toggle('underline') },
            { label: 'Strikethrough', icon: <Strikethrough size={14} />, checked: t.on('strikeThrough'), run: () => t.toggle('strikeThrough') },
            { label: 'Superscript', also: 'raised', run: () => t.script('sup') },
            { label: 'Subscript', also: 'lowered', run: () => t.script('sub') },
            '-',
            { label: 'Bigger text', keys: 'Ctrl+Shift+.', run: () => t.grow(2) },
            { label: 'Smaller text', keys: 'Ctrl+Shift+,', run: () => t.grow(-2) },
            '-',
            { label: 'Clear the formatting', icon: <RemoveFormatting size={14} />, run: t.clear },
          ],
        },
        t && {
          label: 'Paragraph',
          icon: <AlignLeft size={14} />,
          items: [
            { label: 'Align left', icon: <AlignLeft size={14} />, checked: t.curAlign() === 'left', run: () => t.align('left') },
            { label: 'Centre', icon: <AlignCenter size={14} />, checked: t.curAlign() === 'center', run: () => t.align('center') },
            { label: 'Align right', icon: <AlignRight size={14} />, checked: t.curAlign() === 'right', run: () => t.align('right') },
            { label: 'Justify', icon: <AlignJustify size={14} />, checked: t.curAlign() === 'justify', run: () => t.align('justify') },
            '-',
            { label: 'Bulleted list', icon: <List size={14} />, run: () => t.list('bullet') },
            { label: 'Numbered list', icon: <ListOrdered size={14} />, run: () => t.list('number') },
            { label: 'More indent', icon: <IndentIncrease size={14} />, keys: 'Tab', run: () => t.indent(1) },
            { label: 'Less indent', icon: <IndentDecrease size={14} />, keys: 'Shift+Tab', run: () => t.indent(-1) },
          ],
        },
        '-',
        one?.type === 'image' && !!one.src && !!a.editPicture && { label: 'Edit picture', icon: <SlidersHorizontal size={14} />, also: 'edit picture crop turn adjust filter markup words blur', disabled: ro, run: a.editPicture },
        one?.type === 'image' && !!one.src && { label: 'Crop the picture', icon: <Crop size={14} />, disabled: ro, run: a.crop },
        one?.type === 'image' && (!!one.crop || !!one.adjust) && { label: 'Reset the picture', also: 'uncrop colours', disabled: ro, run: a.resetPicture },
        one?.type === 'image' && !!one.src && !!a.aiEdit && { label: 'Change with AI', icon: <WandSparkles size={14} />, also: 'edit picture ai', disabled: ro, run: () => a.aiEdit!('change') },
        one?.type === 'image' && !!one.src && !!a.aiEdit && { label: 'Remove the background', icon: <ImageMinus size={14} />, also: 'cut out background transparent', disabled: ro, run: () => a.aiEdit!('cutout') },
        one?.type === 'image' && !!one.src && !!a.aiEdit && { label: 'Erase part of it', icon: <Eraser size={14} />, also: 'erase remove object', disabled: ro, run: () => a.aiEdit!('erase') },
        one?.type === 'video' && !!keptVideo(one.src) && !!a.editVideo && { label: 'Edit video', icon: <SlidersHorizontal size={14} />, also: 'edit video trim cut crop speed text music gif frame', disabled: ro, run: a.editVideo },
        one?.type === 'chart' && !!a.aiPlotChart && { label: 'Make a plot of this', icon: <ChartScatter size={14} />, also: 'plot chart graph matplotlib', disabled: ro, run: a.aiPlotChart },
        one?.type === 'math' && { label: 'Edit the equation', icon: <Sigma size={14} />, disabled: ro, run: a.editTex },
        one?.type === 'icon' && { label: 'Another icon', icon: <Star size={14} />, disabled: ro, run: a.replaceIcon },
        live && { label: a.running ? 'Stop it' : 'Run it here', icon: a.running ? <CircleStop size={14} /> : <Play size={14} />, also: 'run start live preview stop', run: a.run },
        '-',
        { label: 'Format options', also: 'format panel side', disabled: !n, run: a.formatPanel },
      ],
    },
    {
      label: 'Arrange',
      items: [
        { label: 'Group them', icon: <Group size={14} />, keys: 'Ctrl+G', disabled: ro || !many, run: a.group },
        { label: 'Ungroup', icon: <Ungroup size={14} />, keys: 'Ctrl+Shift+G', disabled: ro || !(one?.type === 'group'), run: a.ungroup },
        '-',
        { label: 'Bring to front', icon: <ArrowUpToLine size={14} />, keys: 'Ctrl+Shift+↑', disabled: ro || !n, run: () => a.restack('front') },
        { label: 'Bring forward', icon: <ArrowUp size={14} />, keys: 'Ctrl+↑', disabled: ro || !n, run: () => a.restack('forward') },
        { label: 'Send backward', icon: <ArrowDown size={14} />, keys: 'Ctrl+↓', disabled: ro || !n, run: () => a.restack('backward') },
        { label: 'Send to back', icon: <ArrowDownToLine size={14} />, keys: 'Ctrl+Shift+↓', disabled: ro || !n, run: () => a.restack('back') },
        '-',
        {
          label: many ? 'Line them up' : 'On the slide',
          icon: <AlignStartVertical size={14} />,
          disabled: ro || !n,
          items: [
            { label: many ? 'Left edges' : 'To the left', icon: <AlignStartVertical size={14} />, run: () => a.align('left') },
            { label: many ? 'Centres across' : 'In the middle, across', icon: <AlignCenterVertical size={14} />, run: () => a.align('center') },
            { label: many ? 'Right edges' : 'To the right', icon: <AlignEndVertical size={14} />, run: () => a.align('right') },
            { label: many ? 'Tops' : 'To the top', icon: <AlignStartHorizontal size={14} />, run: () => a.align('top') },
            { label: many ? 'Middles' : 'In the middle, down', icon: <AlignCenterHorizontal size={14} />, run: () => a.align('middle') },
            { label: many ? 'Bottoms' : 'To the bottom', icon: <AlignEndHorizontal size={14} />, run: () => a.align('bottom') },
            n > 2 && '-',
            n > 2 && { label: 'Spread evenly across', run: () => a.spread('h') },
            n > 2 && { label: 'Spread evenly down', run: () => a.spread('v') },
          ],
        },
        {
          label: 'Turn',
          icon: <RotateCw size={14} />,
          disabled: ro || !n,
          items: [
            { label: 'Turn right 90°', icon: <RotateCw size={14} />, run: () => a.turn(90) },
            { label: 'Turn left 90°', icon: <RotateCcw size={14} />, run: () => a.turn(-90) },
            one?.type === 'image' && '-',
            one?.type === 'image' && { label: 'Flip across', run: () => a.flip('h') },
            one?.type === 'image' && { label: 'Flip down', run: () => a.flip('v') },
          ],
        },
        '-',
        { label: 'Lock in place', icon: <Lock size={14} />, checked: !!one?.lock, disabled: ro || !one, run: a.lock },
      ],
    },
    {
      label: 'Slide',
      items: [
        { label: 'New slide', icon: <Plus size={14} />, keys: 'Ctrl+M', disabled: ro, run: a.newSlide },
        { label: 'Duplicate slide', icon: <Copy size={14} />, disabled: ro, run: a.duplicateSlide },
        { label: 'Delete slide', icon: <Trash2 size={14} />, danger: true, disabled: ro, run: a.deleteSlide },
        { label: 'Skip this slide', checked: a.hidden, also: 'hide hidden', disabled: ro, run: a.skipSlide },
        '-',
        { label: 'Background', disabled: ro, also: 'slide background colour picture', run: () => a.openTab('slide') },
        { label: 'Transition', disabled: ro, also: 'transition morph fade push', run: () => a.openTab('slide') },
        { label: 'Animations', icon: <Sparkles size={14} />, disabled: ro, also: 'animate build', run: () => a.openTab('animate') },
        { label: 'Theme', disabled: ro, also: 'colours fonts look', run: () => a.openTab('theme') },
        '-',
        { label: 'Slide numbers and footer', also: 'footer page number date', disabled: ro, run: a.footer },
        a.slidePicture && { label: 'Save this slide as a picture', icon: <ImageDown size={14} />, also: 'png image export download screenshot', run: a.slidePicture },
        '-',
        { label: 'Present from this slide', icon: <Play size={14} />, keys: 'Shift+F5', run: () => a.present('here') },
        { label: 'Present from the beginning', icon: <Play size={14} />, keys: 'F5', run: () => a.present('start') },
        { label: 'Presenter view, with notes', icon: <MonitorPlay size={14} />, run: () => a.present('presenter') },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Find and replace', icon: <Search size={14} />, keys: 'Ctrl+H', also: 'find search', run: () => a.find(!ro) },
        { label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, keys: 'Ctrl+/', also: 'keys help', run: a.shortcuts },
        '-',
        { label: 'PowerPoint compatible', icon: <Presentation size={14} />, checked: !a.web, also: 'powerpoint pptx keynote google slides format compatible web format made for', disabled: ro, run: () => a.setCompatible(a.web) },
        a.ask && '-',
        a.ask && { label: 'Ask the agent about this slide', icon: <Sparkles size={14} />, run: a.ask },
      ],
    },
  ];
}
