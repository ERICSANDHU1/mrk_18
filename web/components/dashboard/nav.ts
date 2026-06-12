import {
  Droplets,
  FileText,
  Filter,
  LayoutDashboard,
  ListChecks,
  Plug,
  Radio,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "This Week", icon: LayoutDashboard },
  { href: "/leaks", label: "Leaks", icon: Droplets },
  { href: "/channels", label: "Channels", icon: Radio },
  { href: "/funnel", label: "Funnel", icon: Filter },
  { href: "/report", label: "Weekly Report", icon: FileText },
  { href: "/execute", label: "Execute", icon: ListChecks },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The five that earn a slot on the mobile tab bar. */
export const MOBILE_PRIMARY = ["/dashboard", "/leaks", "/channels", "/report"];
