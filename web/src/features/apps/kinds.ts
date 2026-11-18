import { Briefcase, Bus, CloudSun, FlaskConical, GraduationCap, Hammer, HeartPulse, House, Landmark, PartyPopper, PenLine, Receipt, Shapes, ShoppingBag, Telescope, Trophy, Utensils, Map as MapIcon, type LucideIcon } from 'lucide-react';

/** The icon each kind of app has in the Apps page's column; a kind an app of yours made up gets the general one. */
const ICONS: Record<string, LucideIcon> = {
  Research: Telescope,
  Planning: MapIcon,
  Shopping: ShoppingBag,
  Work: Briefcase,
  Writing: PenLine,
  Learning: GraduationCap,
  Build: Hammer,
  Weather: CloudSun,
  Sports: Trophy,
  Food: Utensils,
  Fun: PartyPopper,
  Lab: FlaskConical,
  Transport: Bus,
  Housing: House,
  Health: HeartPulse,
  Debt: Landmark,
  Bills: Receipt,
};

export const kindIcon = (kind: string): LucideIcon => ICONS[kind] ?? Shapes;
