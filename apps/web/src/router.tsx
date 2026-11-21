import { createRootRoute, createRoute, createRouter, type RouteComponent } from '@tanstack/react-router';
import { AppShell, NotFound } from './app';
import { Analytics } from './analytics';
import { Boards } from './boards';
import { Calculators } from './calculators';
import { Channels } from './channels';
import { Comments } from './comments';
import { Competitors } from './competitors';
import { Dashboard } from './dashboard';
import { Health } from './health';
import { Keywords } from './keywords';
import { Library, VideoDetail } from './library';
import { OutlierIndex } from './outlier-index';
import { Outliers } from './outliers';
import { Packaging } from './packaging';
import { Portfolio } from './portfolio';
import { Radar } from './radar';
import { Ranks } from './ranks';
import { Settings } from './settings';
import { Trending } from './trending';

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFound });

const page = <TPath extends string>(path: TPath, component: RouteComponent) => createRoute({ getParentRoute: () => rootRoute, path, component });

const routeTree = rootRoute.addChildren([
  page('/', Dashboard),
  page('/channels', Channels),
  page('/library', Library),
  page('/library/$videoId', VideoDetail),
  page('/analytics', Analytics),
  page('/packaging', Packaging),
  page('/comments', Comments),
  page('/portfolio', Portfolio),
  page('/keywords', Keywords),
  page('/outliers', Outliers),
  page('/index', OutlierIndex),
  page('/trending', Trending),
  page('/boards', Boards),
  page('/calculators', Calculators),
  page('/competitors', Competitors),
  page('/ranks', Ranks),
  page('/radar', Radar),
  page('/settings', Settings),
  page('/health', Health),
]);

export const router = createRouter({ routeTree, basepath: '/app', defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
