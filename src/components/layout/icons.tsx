import {
  Home, School, List, Plus, LifeBuoy, Inbox, KeyRound, Activity, ScrollText, Settings, CalendarDays, Layers, Table2, BookOpen, Users,
  LayoutGrid, ShieldCheck, ArrowLeftRight, GraduationCap, UsersRound, Link2, Upload, ClipboardCheck, Workflow, CheckCheck, Megaphone,
  BarChart3, Download, ListChecks, CalendarCheck, Star, Brush, Bell, Contact, FileText, User, BookMarked, Presentation,
} from "lucide-react";

const MAP = {
  home: Home, school: School, list: List, plus: Plus, lifebuoy: LifeBuoy, inbox: Inbox, key: KeyRound, activity: Activity, scroll: ScrollText,
  settings: Settings, calendar: CalendarDays, layers: Layers, table: Table2, book: BookOpen, users: Users, grid: LayoutGrid, shield: ShieldCheck,
  swap: ArrowLeftRight, graduation: GraduationCap, family: UsersRound, link: Link2, upload: Upload, clipboard: ClipboardCheck, workflow: Workflow,
  check: CheckCheck, megaphone: Megaphone, chart: BarChart3, download: Download, checklist: ListChecks, calendarCheck: CalendarCheck, star: Star,
  broom: Brush, bell: Bell, contact: Contact, file: FileText, user: User, guide: BookMarked, class: Presentation,
} as const;

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const I = MAP[name as keyof typeof MAP] ?? Home;
  return <I className={className ?? "size-[20px]"} aria-hidden />;
}
