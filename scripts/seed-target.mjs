import {
  CliError,
  parseCliArgs,
  resolveDatabaseTarget
} from './db/_shared.mjs'

export function resolveSeedTarget(options, { testOnly = false } = {}) {
  const target = resolveDatabaseTarget(options, { access: 'write' })

  if (target.local && !options.url && options.environment !== 'test') {
    throw new CliError('Seed target must be explicit. Use --url file:./test.db, or --environment test for the configured test database.')
  }

  if (testOnly && target.environment !== 'test' && (!target.local || target.environment !== 'development')) {
    throw new CliError('Fixture and test-user seeds only accept an explicit local development database or a database allowlisted as test.')
  }

  return target
}

export function readSeedTarget({ testOnly = false } = {}) {
  try {
    const { options, positional } = parseCliArgs(process.argv.slice(2), {
      booleanFlags: ['--help', '--allow-production-write'],
      valueFlags: ['--url', '--environment', '--confirm-target']
    })

    if (positional.length) {
      throw new CliError(`Unexpected argument: ${positional[0]}`)
    }

    if (options.help) {
      console.log(`Usage: node ${process.argv[1]} [target options]
  --url <url>                 Explicit database URL; otherwise use TURSO_URL
  --environment <name>        Database environment; must match DB_REMOTE_TARGETS
  --confirm-target <host>     Required for every remote database
  --allow-production-write    Required for production administrator seeding

Local example: --url file:./test.db
Remote test example: --environment test --confirm-target test-db.example.test
Remote targets must be listed in DB_REMOTE_TARGETS and require TURSO_TOKEN.
${testOnly
  ? 'Fixtures and test users are restricted to local development or test databases.'
  : 'Administrator seeding supports production with explicit target and write confirmation.'}`)
      process.exit(0)
    }

    return resolveSeedTarget(options, { testOnly })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
