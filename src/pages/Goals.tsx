import { Text } from '@mantine/core'
import { GoalsPanel } from '../components/GoalsPanel'

export function Goals() {
    return (
        <div className="page-content goals-page">
            <h1>Goals</h1>
            <Text className="subhead">
                Set optional targets that add context without changing your health records.
            </Text>
            <GoalsPanel />
        </div>
    )
}
