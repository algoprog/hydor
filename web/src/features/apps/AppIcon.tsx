// An app's face: its icon on a tile of its colour, the same in the gallery, its page and the public page.
import {
  AppWindow,
  BookOpen,
  Bot,
  Briefcase,
  Calculator,
  Calendar,
  Camera,
  ChartColumn,
  Code,
  Dumbbell,
  FileSearch,
  GraduationCap,
  Globe,
  Heart,
  House,
  Languages,
  Lightbulb,
  ListChecks,
  Mail,
  Map as MapIcon,
  MessageSquare,
  Music,
  Newspaper,
  PenLine,
  Plane,
  Scale,
  ScrollText,
  ShoppingCart,
  Sparkles,
  Telescope,
  Utensils,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { APP_COLORS } from '@shared/apps';
import { cx } from '../../components/ui';

export const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  telescope: Telescope,
  plane: Plane,
  scale: Scale,
  'file-search': FileSearch,
  'list-checks': ListChecks,
  mail: Mail,
  'graduation-cap': GraduationCap,
  newspaper: Newspaper,
  'scroll-text': ScrollText,
  'app-window': AppWindow,
  'pen-line': PenLine,
  lightbulb: Lightbulb,
  calendar: Calendar,
  chart: ChartColumn,
  code: Code,
  globe: Globe,
  'book-open': BookOpen,
  briefcase: Briefcase,
  heart: Heart,
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  dumbbell: Dumbbell,
  music: Music,
  camera: Camera,
  map: MapIcon,
  'message-square': MessageSquare,
  languages: Languages,
  calculator: Calculator,
  home: House,
  wrench: Wrench,
  bot: Bot,
};

export function AppIcon({ icon, color, size = 40, className }: { icon: string; color: string; size?: number; className?: string }) {
  const Icon = ICONS[icon] ?? Sparkles;
  const c = APP_COLORS[color] ?? APP_COLORS.blue;
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), color: c, background: `color-mix(in oklab, ${c} 15%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 22%, transparent)` }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  );
}
