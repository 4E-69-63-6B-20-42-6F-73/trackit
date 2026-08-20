import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core'
import { IconBell, IconPlus, IconSearch } from '@tabler/icons-react'
import type { Page } from '../domain/types'

export function Header({ page, add }: { page: Page; add: () => void }) {
    return (
        <header className="topbar">
            <div>
                <Text className="mobile-brand">
                    track <strong>it</strong>
                </Text>
                <Text className="page-title">{page}</Text>
            </div>
            <Group gap="xs">
                <Tooltip label="Search">
                    <ActionIcon variant="subtle" color="gray" size="lg">
                        <IconSearch size={20} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label="Notifications">
                    <ActionIcon variant="subtle" color="gray" size="lg">
                        <IconBell size={20} />
                    </ActionIcon>
                </Tooltip>
                <Button color="teal" leftSection={<IconPlus size={18} />} onClick={add}>
                    Quick add
                </Button>
            </Group>
        </header>
    )
}
