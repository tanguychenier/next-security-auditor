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
 * IT READS, IT NEVER EXECUTES. The audited project is untrusted by definition —
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
    if (!isUnderApp(file)) return undefined

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
    return undefined
  }
}

const isUnderApp = (file: string): boolean => file.startsWith('app/') || file.startsWith('src/app/')

const exportsName = (source: string, name: string): boolean =>
  new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`).test(source) ||
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)

const declaresUseServer = (source: string): boolean =>
  /^\s*(['"])use server\1/m.test(source.slice(0, 200))

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
