import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { ProjectReader } from '../../application/ports/project-reader.js'
import type { SurfaceEntry } from '../../domain/value-objects/surface-entry.js'

const HTTP_METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const
const IGNORED = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage'])
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/

/**
 * Walks a Next.js project and returns its attack surface.
 *
 * IT READS, IT NEVER EXECUTES. The audited project is untrusted by definition :
 * it is the thing suspected of being vulnerable. Importing its modules to
 * inspect them would run its code on the auditor's machine.
 *
 * The parsing is deliberately lexical rather than AST-based. An AST parser
 * would need to agree with whichever TypeScript version the project pins, and
 * would fail closed on a syntax it does not know. Here an unparsed file simply
 * contributes nothing, and the audit continues.
 */
export class NextProjectReader implements ProjectReader {
  constructor(private readonly root: string) {}

  async read(file: string): Promise<string> {
    return readFile(join(this.root, file), 'utf8')
  }

  async attackSurface(): Promise<SurfaceEntry[]> {
    const files = await this.sourceFiles(this.root)
    const entries: SurfaceEntry[] = []
    for (const file of files) {
      const source = await readFile(join(this.root, file), 'utf8')
      const entry = this.classify(file, source)
      if (entry) entries.push(entry)
    }
    return entries.toSorted((left, right) => left.file.localeCompare(right.file))
  }

  private async sourceFiles(directory: string): Promise<string[]> {
    const found: string[] = []
    let contents
    try {
      contents = await readdir(directory, { withFileTypes: true })
    } catch {
      return found
    }
    for (const item of contents) {
      if (item.name.startsWith('.') && item.name !== '.') continue
      const full = join(directory, item.name)
      if (item.isDirectory()) {
        if (IGNORED.has(item.name)) continue
        found.push(...(await this.sourceFiles(full)))
      } else if (SOURCE.test(item.name)) {
        found.push(relative(this.root, full).split(sep).join('/'))
      }
    }
    return found
  }

  private classify(file: string, source: string): SurfaceEntry | undefined {
    if (/^(src\/)?middleware\.(ts|js)$/.test(file)) {
      return { kind: 'middleware', file, matcher: matcherOf(source) }
    }
    if (isUnderPages(file)) return this.classifyPagesRouter(file, source) ?? shippedToTheBrowser(file, source)
    if (!isUnderApp(file)) return shippedToTheBrowser(file, source)

    if (/\/route\.(ts|js|tsx|jsx)$/.test(file)) {
      const methods = HTTP_METHODS.filter((method) => exportsName(source, method))
      if (methods.length === 0) return undefined
      return { kind: 'route-handler', file, reachableAs: routeOf(file), methods }
    }
    if (declaresUseServer(source)) {
      const actions = exportedFunctions(source)
      if (actions.length === 0) return undefined
      return { kind: 'server-action', file, exports: actions }
    }
    // A PAGE IS ONLY ATTACKABLE THROUGH WHAT THE URL CARRIES. One that ignores
    // searchParams and params takes nothing from the outside.
    if (/\/page\.(tsx|jsx|ts|js)$/.test(file) && /\b(searchParams|params)\b/.test(source)) {
      return { kind: 'page', file, reachableAs: routeOf(file) }
    }
    return shippedToTheBrowser(file, source)
  }

  /**
   * The router half this tool used to walk straight past.
   *
   * A `pages/api` HANDLER IS AN ENDPOINT LIKE ANY OTHER, and most applications
   * that have one have not migrated. Reading only `app/` meant a project whose
   * whole API lives there mapped to nothing and was told no attack surface was
   * found, which is the most expensive sentence this tool can print.
   *
   * One handler answers every verb, because the Pages Router hands it the
   * request whatever the method is. The verbs it compares `req.method` against
   * are the ones it means to serve, and the ones it does not compare are the
   * hole worth asking about.
   */
  private classifyPagesRouter(file: string, source: string): SurfaceEntry | undefined {
    if (/\/_(app|document|error|middleware)\.(tsx|jsx|ts|js)$/.test(file)) return undefined
    if (!hasDefaultExport(source)) return undefined

    if (/^(src\/)?pages\/api\//.test(file)) {
      const methods = methodsGuardedIn(source)
      return {
        kind: 'route-handler',
        file,
        reachableAs: pagesRouteOf(file),
        ...(methods.length === 0 ? {} : { methods }),
      }
    }

    // SAME RULE AS A PAGE IN THE APP ROUTER: one that reads nothing from the
    // URL takes nothing from the outside.
    if (/\b(getServerSideProps|getStaticProps|query|params)\b/.test(source)) {
      return { kind: 'page', file, reachableAs: pagesRouteOf(file) }
    }
    return undefined
  }
}

const isUnderApp = (file: string): boolean => file.startsWith('app/') || file.startsWith('src/app/')

const isUnderPages = (file: string): boolean => file.startsWith('pages/') || file.startsWith('src/pages/')

/** A Pages Router route is the file itself, not the directory holding it. */
const pagesRouteOf = (file: string): string => {
  const named = file.replace(/^(src\/)?pages\//, '').replace(/\.(tsx|jsx|ts|js|mjs)$/, '')
  const segments = named.split('/')
  if (segments[segments.length - 1] === 'index') segments.pop()
  return `/${segments.join('/')}`
}

const hasDefaultExport = (source: string): boolean =>
  /export\s+default\s+/.test(source) || /export\s*\{[^}]*\bdefault\b[^}]*\}/.test(source)

/** The verbs a handler compares `req.method` against, which are the ones it meant to serve. */
const methodsGuardedIn = (source: string): string[] => {
  const seen = new Set<string>()
  for (const match of source.matchAll(/\bmethod\s*[=!]==?\s*['"`]([A-Za-z]+)['"`]/g)) {
    const verb = match[1]?.toUpperCase()
    if (verb !== undefined && (HTTP_METHODS as readonly string[]).includes(verb)) seen.add(verb)
  }
  return [...seen].sort()
}

const exportsName = (source: string, name: string): boolean =>
  new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`).test(source) ||
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)

const declaresUseServer = (source: string): boolean =>
  /^\s*(['"])use server\1/m.test(source.slice(0, 200))

const declaresUseClient = (source: string): boolean =>
  /^\s*(['"])use client\1/m.test(source.slice(0, 200))

/**
 * A file whose whole content reaches the browser.
 *
 * THE CATALOGUE ALREADY NAMED THESE RULES and nothing could carry them:
 * hardcoded-secret, server-secret-reaching-the-client and secret-in-public-env
 * all describe a Client Component, and a Client Component was never surfaced
 * unless it happened to also be a page reading searchParams. A key written in
 * one shipped, run after run, with the report saying nothing.
 */
const shippedToTheBrowser = (file: string, source: string): SurfaceEntry | undefined =>
  declaresUseClient(source) ? { kind: 'client-component', file } : undefined

const exportedFunctions = (source: string): string[] => {
  const names = new Set<string>()
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1])
  }
  for (const match of source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    if (match[1]) names.add(match[1])
  }
  return [...names].sort()
}

const matcherOf = (source: string): string[] => {
  const block = /matcher\s*:\s*\[([^\]]*)\]/.exec(source)
  if (!block?.[1]) return []
  return [...block[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1] ?? '').filter(Boolean)
}

/** Turns `app/api/invoices/[id]/route.ts` into `/api/invoices/[id]`. */
const routeOf = (file: string): string => {
  const withoutApp = file.replace(/^(src\/)?app\//, '')
  const segments = withoutApp.split('/').slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment))
  return `/${segments.join('/')}`
}
