import { execFileSync } from 'node:child_process';

interface ContainerInfo {
    Config: { Labels?: Record<string, string>; Env?: string[] };
    NetworkSettings: { Ports: Record<string, Array<{HostIp: string; HostPort: string}> | null> };
    Mounts: Array<{Type: string; Name?: string; Destination: string}>;
}

function docker(args: string[]): string {
    return execFileSync('docker', args, {encoding: 'utf8', timeout: 10_000}).trim();
}

function inspect(container: string): ContainerInfo {
    const result = JSON.parse(docker(['inspect', container])) as ContainerInfo[];
    if (result.length !== 1) throw new Error('Inspection du conteneur de recette ambiguë');
    return result[0];
}

/** Fail closed before destructive fixtures: HTTP and SQL must target the same disposable project. */
export function assertReleaseIsolation(baseURL: string | undefined): void {
    const backendId = process.env.FLUIDITE_BACKEND_CONTAINER;
    if (!backendId || !baseURL) throw new Error('Recette isolée requise : URL et backend explicites');
    const url = new URL(baseURL);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        throw new Error('Recette isolée requise : endpoint HTTP loopback uniquement');
    }
    const backend = inspect(backendId);
    const labels = backend.Config.Labels ?? {};
    const project = labels['com.docker.compose.project'] ?? '';
    if (!/^beercall-release-e2e-[a-z0-9-]+$/.test(project)
        || labels['com.docker.compose.service'] !== 'backend'
        || labels['beercall.test'] !== 'release-e2e') {
        throw new Error('Backend hors projet de release E2E jetable');
    }
    const environment = Object.fromEntries((backend.Config.Env ?? []).map((entry): [string, string] => {
        const separator = entry.indexOf('=');
        return [entry.slice(0, separator), entry.slice(separator + 1)];
    }));
    if (environment.APP_ENV !== 'test' || environment.FIREBASE_CREDENTIALS_PATH !== '') {
        throw new Error('Recette isolée requise : APP_ENV=test et Firebase désactivé');
    }
    const database = new URL((environment.DATABASE_URL ?? '').replace('postgresql+psycopg:', 'postgresql:'));
    if (database.hostname !== 'db_beercall') throw new Error('Base hors réseau de la recette isolée');
    const uploads = backend.Mounts.find((mount) => mount.Destination === '/app/uploads');
    if (uploads?.Type !== 'volume' || !uploads.Name?.startsWith(project + '_')) {
        throw new Error('Volume uploads hors projet de recette isolée');
    }
    const proxyIds = docker(['ps', '-q', '--filter', 'label=com.docker.compose.project=' + project,
        '--filter', 'label=com.docker.compose.service=nginx_beercall']).split(/\r?\n/).filter(Boolean);
    if (proxyIds.length !== 1) throw new Error('Proxy de recette isolée absent ou ambigu');
    const proxy = inspect(proxyIds[0]);
    const bindings = proxy.NetworkSettings.Ports['80/tcp'] ?? [];
    if (proxy.Config.Labels?.['com.docker.compose.project'] !== project
        || !bindings.some((binding) => ['127.0.0.1', '::1'].includes(binding.HostIp)
            && binding.HostPort === (url.port || '80'))) {
        throw new Error('URL HTTP et backend ne ciblent pas le même projet isolé');
    }
}
