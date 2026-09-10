import { describe, expect, it } from 'vitest'
import { parse } from '../../src/cli/main.js'

describe('reading the command line', () => {
  it('defaults to the current directory, a local dev server and console output', () => {
    expect(parse([])).toMatchObject({
      target: 'http://localhost:3000',
      format: 'console',
      dryRun: false,
    })
  })

  it('takes the path as the first positional argument', () => {
    expect(parse(['./apps/shop'])).toMatchObject({ path: './apps/shop' })
  })

  it('does not mistake a flag value for the path', () => {
    // `--target http://x` would otherwise make "http://x" the audited directory.
    expect(parse(['--target', 'http://staging.example.com']).valueOf()).toMatchObject({
      target: 'http://staging.example.com',
    })
  })

  it('refuses a format it cannot produce instead of falling back silently', () => {
    expect(() => parse(['--format', 'pdf'])).toThrow('unknown format')
  })

  it('refuses a flag that takes a value and was given none', () => {
    // `--target` last on the line silently hunted localhost:3000, which is a
    // different server from the one the operator named.
    expect(() => parse(['/proj', '--target'])).toThrow('--target needs a value')
    expect(() => parse(['/proj', '--baseline'])).toThrow('--baseline needs a value')
    expect(() => parse(['/proj', '--model'])).toThrow('--model needs a value')
  })

  it('refuses a flag that swallowed the flag after it', () => {
    // `--out --format sarif` wrote the report into a file named "--format".
    expect(() => parse(['/proj', '--out', '--format', 'sarif'])).toThrow('--out needs a value')
    expect(() => parse(['/proj', '--emit-tests', '--accept'])).toThrow('--emit-tests needs a value')
    expect(() => parse(['/proj', '--since', '--no-cache'])).toThrow('--since needs a value')
    expect(() => parse(['/proj', '--target', '--dry-run'])).toThrow('--target needs a value')
  })

  it('recognises the dry run', () => {
    expect(parse(['--dry-run'])).toMatchObject({ dryRun: true })
  })

  it('asks for help', () => {
    expect(parse(['--help'])).toBe('help')
  })

  it('takes a git reference to scope the hunt to', () => {
    expect(parse(['--since', 'origin/main'])).toMatchObject({ since: 'origin/main' })
  })

  it('takes the level that stops the build', () => {
    expect(parse(['--fail-on', 'high'])).toMatchObject({ failOn: 'high' })
  })

  it('recognises the request to ask again about unchanged code', () => {
    expect(parse(['--no-cache'])).toMatchObject({ noCache: true })
    expect(parse([])).toMatchObject({ noCache: false })
  })

  it('does not mistake --no-cache for the path', () => {
    // It takes no value, so the word after it is still an argument of its own.
    expect(parse(['--no-cache', './apps/shop'])).toMatchObject({ path: './apps/shop' })
  })
})

describe('saying which version is running', () => {
  it('answers the version rather than starting a hunt', () => {
    // WITHOUT THIS the flag fell through and the tool went looking for an
    // application to attack, which is not what anybody typing --version wants.
    expect(parse(['--version'])).toBe('version')
  })

  it('still asks for help', () => {
    expect(parse(['--help'])).toBe('help')
  })
})
