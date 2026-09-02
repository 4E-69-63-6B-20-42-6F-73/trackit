export const csrfToken = () =>
    document.cookie
        .split('; ')
        .find(value => value.startsWith('trackit_csrf='))
        ?.split('=')[1]
