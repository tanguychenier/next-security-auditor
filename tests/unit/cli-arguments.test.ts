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

  it('recognises the dry run', () => {
    expect(parse(['--dry-run'])).toMatchObject({ dryRun: true })
  })

  it('asks for help', () => {
    expect(parse(['--help'])).toBe('help')
  })
})
