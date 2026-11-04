import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, useRouter } from '@tanstack/react-router';
import { lazy, Suspense, useMemo } from 'react';
import { ProjectLocationProvider, type ProjectLocationPort } from '@/components/project-location';
import { ProjectRuntimeProvider } from '@/components/project-session-provider';

const HumanView = lazyRouteComponent(() => import('@/app/page'));
const ProjectsLayout = lazy(() => import('@/app/projects/layout'));
const ProjectHelp = lazyRouteComponent(() => import('@/app/projects/help/page'));
const WorkspaceCatalog = lazyRouteComponent(() => import('@/components/workspace-catalog'));
const WorkspaceProjectPage = lazy(() => import('@/components/workspace-project'));
const WorkspaceMembers = lazy(() => import('@/components/workspace-members'));

const rootRoute = createRootRoute({ component: WebRoot, notFoundComponent: () => <main><h1>Страница не найдена</h1><a href="/projects">Открыть проекты</a></main> });
const humanViewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HumanView });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects', component: () => <Suspense fallback={<p role="status">Загружаем проекты…</p>}><ProjectsLayout><Outlet /></ProjectsLayout></Suspense> });
const catalogRoute = createRoute({ getParentRoute: () => projectsRoute, path: '/', component: WorkspaceCatalog });
const helpRoute = createRoute({ getParentRoute: () => projectsRoute, path: 'help', component: ProjectHelp });
const projectRoute = createRoute({ getParentRoute: () => projectsRoute, path: '$projectId', component: ProjectScreen });
const membersRoute = createRoute({ getParentRoute: () => projectsRoute, path: '$projectId/members', component: MembersScreen });

/** Внедряет router-owned query navigation, сохраняя устойчивые записи browser history. */
function WebRoot() {
  const router = useRouter();
  const navigation = useMemo<ProjectLocationPort>(() => ({
    readSearch: () => router.history.location.search,
    pushSearch(search) { void router.navigate({ href: router.history.location.pathname + (search ? '?' + search : ''), resetScroll: false }); },
    subscribe: listener => router.history.subscribe(listener),
  }), [router]);
  return <ProjectRuntimeProvider><ProjectLocationProvider value={navigation}><Outlet /></ProjectLocationProvider></ProjectRuntimeProvider>;
}

/** Передаёт декодированный router parameter существующему проектному экрану. */
function ProjectScreen() { return <WorkspaceProjectPage projectId={projectRoute.useParams().projectId} />; }

/** Открывает участников в том же workspace session scope, что и соседние экраны. */
function MembersScreen() { return <WorkspaceMembers projectId={membersRoute.useParams().projectId} />; }

/** Создаёт единственный router самостоятельной оболочки, не экспортируя его во встроенный UI. */
export function createWebRouter() {
  return createRouter({ routeTree: rootRoute.addChildren([humanViewRoute, projectsRoute.addChildren([catalogRoute, helpRoute, membersRoute, projectRoute])]), scrollRestoration: true });
}
