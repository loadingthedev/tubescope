import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useRouterState, type LinkProps } from '@tanstack/react-router';
import {
  Bookmark,
  Calculator,
  ChartLine,
  Clapperboard,
  Database,
  ExternalLink,
  Flame,
  HeartPulse,
  LayoutDashboard,
  LayoutGrid,
  ListOrdered,
  MessagesSquare,
  Monitor,
  Moon,
  PenLine,
  Radar,
  Search,
  Settings,
  Sun,
  TrendingUp,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { QuotaResponse } from '@tubescope/shared';
import { getJson } from './api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const classicUrl = import.meta.env.DEV ? 'http://localhost:4949/' : '/';

type NavItem = { to: Exclude<LinkProps['to'], undefined>; label: string; icon: LucideIcon };
const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: 'Desk',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/channels', label: 'Channels', icon: Tv },
      { to: '/library', label: 'Video library', icon: Clapperboard },
      { to: '/analytics', label: 'Analytics', icon: ChartLine },
      { to: '/packaging', label: 'Packaging', icon: PenLine },
      { to: '/comments', label: 'Comments', icon: MessagesSquare },
      { to: '/portfolio', label: 'All channels', icon: LayoutGrid },
    ],
  },
  {
    label: 'Research',
    items: [
      { to: '/keywords', label: 'Keywords', icon: Search },
      { to: '/outliers', label: 'Outliers', icon: TrendingUp },
      { to: '/index', label: 'Outlier index', icon: Database },
      { to: '/trending', label: 'Trending & niches', icon: Flame },
      { to: '/boards', label: 'Boards & blueprints', icon: Bookmark },
      { to: '/calculators', label: 'Calculators', icon: Calculator },
    ],
  },
  {
    label: 'Watch',
    items: [
      { to: '/competitors', label: 'Competitors', icon: Users },
      { to: '/ranks', label: 'Rank tracker', icon: ListOrdered },
      { to: '/radar', label: 'Virality radar', icon: Radar },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/health', label: 'Health', icon: HeartPulse },
    ],
  },
];

const isActive = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));

function currentPage(pathname: string) {
  for (const group of navigation) for (const item of group.items) if (isActive(pathname, item.to)) return { group: group.label, label: item.label };
  return null;
}

/* An ink dot circled in red pencil: what this desk is for. */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <circle cx="16" cy="16.5" r="3.2" className="fill-primary-foreground" />
      <path
        d="M24.5 12.2c-1.6-3.4-6.4-5-10.6-3.6C9 10.2 6.6 14.6 8.2 18.6c1.7 4.2 7.5 5.9 11.9 3.9 3.6-1.7 5.5-5.4 4.4-8.6"
        fill="none"
        stroke="var(--pencil)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Tubescope">
              <Link to="/">
                <BrandMark />
                <span className="flex flex-col leading-tight">
                  <span className="font-heading text-[15px] font-semibold tracking-tight">Tubescope</span>
                  <span className="eyebrow text-[10px]">Research desk</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map(group => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="eyebrow">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, item.to)} tooltip={item.label}>
                      <Link to={item.to} onClick={() => setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Classic UI">
              <a href={classicUrl}>
                <ExternalLink />
                <span>Classic UI</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function QuotaMeter() {
  const quota = useQuery({ queryKey: ['quota'], queryFn: ({ signal }) => getJson<QuotaResponse>('/quota', signal), refetchInterval: 60_000 });
  if (quota.isError)
    return (
      <Button variant="ghost" size="sm" onClick={() => void quota.refetch()}>
        Quota unavailable · Retry
      </Button>
    );
  const today = quota.data?.today;
  const used = today ? (today.units / today.limit) * 100 : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-3 rounded-md px-2 py-1" tabIndex={0} aria-live="polite">
          <span className="eyebrow hidden sm:inline">API quota</span>
          <div className="flex w-14 flex-col gap-1 sm:w-28">
            <span className="num hidden text-xs sm:inline">{today ? `${today.units.toLocaleString()} / ${today.limit.toLocaleString()}` : 'Loading…'}</span>
            <Progress value={used} aria-label="API quota used today" className="h-1" />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {today ? `${today.remaining.toLocaleString()} units left today. Searches have their own limit of 100 a day.` : 'Reading quota…'}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Paper
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Blueprint
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> Match system
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const page = currentPage(pathname);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="grid-paper min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <p className="flex min-w-0 items-baseline gap-2 text-sm">
            {page ? <span className="eyebrow">{page.group}</span> : null}
            <span className="truncate font-medium">{page?.label ?? 'Tubescope'}</span>
          </p>
          <div className="ml-auto flex items-center gap-1">
            <QuotaMeter />
            <ThemeSwitch />
          </div>
        </header>
        <main id="main-content" className="mx-auto flex w-full max-w-[1360px] flex-col gap-8 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function NotFound() {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>This address isn't part of the desk. Pick a page from the sidebar, or open the classic UI.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <a href={classicUrl}>
            Open classic UI <ExternalLink data-icon="inline-end" />
          </a>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
