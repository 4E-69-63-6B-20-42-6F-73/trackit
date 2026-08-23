import { Button, Group, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import type { Page } from '../domain/types'

export function Header({ page, add }: { page: Page; add: () => void }) {
    return (
        <header className="topbar">
            <div>
                <Text className="mobile-brand">
                    track <strong>it</strong>
                </Text>
                <Text className="page-context" aria-label="Current section">
                    TrackIt <span aria-hidden="true">/</span> {page}
                </Text>
            </div>
            <Group gap="xs">
                <Button color="trackit" leftSection={<IconPlus size={18} />} onClick={add}>
                    Quick add
                </Button>
            </Group>
        </header>
    )
}
