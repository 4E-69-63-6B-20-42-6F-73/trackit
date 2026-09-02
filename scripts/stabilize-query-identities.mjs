import fs from 'node:fs'

const workflowPath = '.github/workflows/auto-format.yml'

const replaceRequired = (path, search, replacement, label) => {
    const source = fs.readFileSync(path, 'utf8')
    if (!source.includes(search)) throw new Error(`Missing ${label}`)
    fs.writeFileSync(path, source.replace(search, replacement))
}

replaceRequired(
    'src/hooks/useServerData.tsx',
    '    const goals = goalsQuery.data ?? []\n',
    '    const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data])\n',
    'server data goals fallback',
)

replaceRequired(
    'src/hooks/useTodayHealth.ts',
    "    const daily = dailyQuery.data ?? []\n    const details = observationsQuery.data ?? []\n    const goalEvaluations = goalEvaluationsQuery.data ?? ({} as Record<string, GoalEvaluation>)\n",
    "    const daily = useMemo(() => dailyQuery.data ?? [], [dailyQuery.data])\n    const details = useMemo(() => observationsQuery.data ?? [], [observationsQuery.data])\n    const goalEvaluations = useMemo(\n        () => goalEvaluationsQuery.data ?? ({} as Record<string, GoalEvaluation>),\n        [goalEvaluationsQuery.data],\n    )\n",
    'today health query fallbacks',
)

replaceRequired(
    'src/pages/Metrics.tsx',
    '    const sourceSummaries = sourceQuery.data ?? []\n',
    '    const sourceSummaries = useMemo(() => sourceQuery.data ?? [], [sourceQuery.data])\n',
    'metric source fallback',
)

replaceRequired(
    'src/pages/Trends.tsx',
    '    const availableMetrics = availableMetricsQuery.data ?? []\n',
    '    const availableMetrics = useMemo(\n        () => availableMetricsQuery.data ?? [],\n        [availableMetricsQuery.data],\n    )\n',
    'trend metric fallback',
)

replaceRequired(
    'src/pages/connections/devices/index.tsx',
    '    const devices = devicesQuery.data ?? []\n',
    '    const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data])\n',
    'device list fallback',
)

replaceRequired(
    'src/pages/connections/mcp/index.tsx',
    '    const clients = status?.clients ?? []\n',
    '    const clients = useMemo(() => status?.clients ?? [], [status])\n',
    'mcp client fallback',
)

replaceRequired(
    'src/pages/connections/devices/new.tsx',
    "    const createMutation = useMutation({\n        mutationFn: createPairingCode,\n    })\n    const pairing = createMutation.data ?? null\n",
    "    const createMutation = useMutation({\n        mutationFn: createPairingCode,\n    })\n    const createPairing = createMutation.mutate\n    const pairing = createMutation.data ?? null\n",
    'pairing mutation alias',
)
replaceRequired(
    'src/pages/connections/devices/new.tsx',
    "    useEffect(() => {\n        if (initialCreateStartedRef.current) return\n        initialCreateStartedRef.current = true\n        createMutation.mutate()\n    }, [])\n",
    "    useEffect(() => {\n        if (initialCreateStartedRef.current) return\n        initialCreateStartedRef.current = true\n        createPairing()\n    }, [createPairing])\n",
    'pairing creation effect',
)

replaceRequired(
    'README.md',
    'This runs formatting, linting, migration consistency, secret scanning, unit tests, and the production\nbuild. Pull-request CI additionally runs PostgreSQL integration/migration checks, Playwright E2E\ncoverage, container smoke/security checks, and Android validation.\n',
    'This runs formatting, linting, migration consistency, secret scanning, unit tests, and the production\nbuild. Pull-request CI additionally regenerates OpenAPI types and Drizzle migration metadata and fails\nif regeneration leaves the tree dirty. Same-repository PRs use Auto-format to commit regenerated\nartifacts automatically. CI also runs PostgreSQL integration/migration checks, Playwright E2E\ncoverage, container smoke/security checks, and Android validation.\n',
    'generated artifact documentation',
)

replaceRequired(
    workflowPath,
    '            - name: Stabilize query identities\n              run: node scripts/stabilize-query-identities.mjs\n',
    '',
    'temporary workflow hook',
)

fs.rmSync(new URL(import.meta.url))
