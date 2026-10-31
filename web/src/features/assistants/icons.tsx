// The icons an assistant can have, by their names in shared/assistants.ts.
import {
  BookOpen,
  Bot,
  Briefcase,
  Calculator,
  CalendarCheck,
  ChartColumn,
  ChefHat,
  Code,
  Dumbbell,
  GraduationCap,
  Heart,
  House,
  Languages,
  Leaf,
  Lightbulb,
  Mail,
  Megaphone,
  Music,
  Newspaper,
  Palette,
  PenLine,
  Plane,
  Scale,
  Shield,
  Sparkles,
  Stethoscope,
  Telescope,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ASSISTANT_ICONS } from '@shared/assistants';
import { cx } from '../../components/ui';

export const ICONS: Record<(typeof ASSISTANT_ICONS)[number], LucideIcon> = {
  sparkles: Sparkles,
  telescope: Telescope,
  'pen-line': PenLine,
  code: Code,
  'graduation-cap': GraduationCap,
  'calendar-check': CalendarCheck,
  'chart-column': ChartColumn,
  bot: Bot,
  briefcase: Briefcase,
  'book-open': BookOpen,
  calculator: Calculator,
  'chef-hat': ChefHat,
  dumbbell: Dumbbell,
  heart: Heart,
  languages: Languages,
  lightbulb: Lightbulb,
  megaphone: Megaphone,
  music: Music,
  palette: Palette,
  plane: Plane,
  house: House,
  mail: Mail,
  scale: Scale,
  shield: Shield,
  wallet: Wallet,
  stethoscope: Stethoscope,
  leaf: Leaf,
  newspaper: Newspaper,
  wrench: Wrench,
  users: Users,
};

/** An assistant's icon on a soft tile, or bare (`plain`) inside a chip. */
export function AssistantIcon({ icon, size = 16, plain, className }: { icon: string; size?: number; plain?: boolean; className?: string }) {
  const I = ICONS[icon as keyof typeof ICONS] ?? Bot;
  if (plain) return <I size={size} className={cx('shrink-0', className)} />;
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent', className)} style={{ width: size + 14, height: size + 14 }}>
      <I size={size} />
    </span>
  );
}
