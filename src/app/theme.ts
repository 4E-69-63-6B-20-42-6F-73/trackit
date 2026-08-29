import { createTheme } from '@mantine/core'

export const theme = createTheme({
    primaryColor: 'trackit',
    primaryShade: 8,
    defaultRadius: 'md',
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    headings: {
        fontFamily:
            'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: '700',
    },
    components: {
        Modal: {
            defaultProps: {
                centered: true,
                radius: 'lg',
                size: 'md',
                overlayProps: { backgroundOpacity: 0.45, blur: 2 },
            },
        },
        TextInput: {
            styles: {
                description: {
                    color: 'var(--mantine-color-gray-7)',
                },
            },
        },
    },
    colors: {
        trackit: [
            '#f1f7f5',
            '#e1eeea',
            '#c1dcd4',
            '#9dc8bc',
            '#7db7a7',
            '#68ab99',
            '#5ba591',
            '#488f7d',
            '#38645e',
            '#28564e',
        ],
    },
})
