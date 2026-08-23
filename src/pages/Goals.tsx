import { GoalsPanel } from '../components/GoalsPanel'
import { PageHeader } from '../components/PageHeader'

export function Goals() {
    return (
        <div className="page-content goals-page">
            <PageHeader
                title="Goals"
                description="Set optional targets that add context without changing your health records."
            />
            <GoalsPanel />
        </div>
    )
}
