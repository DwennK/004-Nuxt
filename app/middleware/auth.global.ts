export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  const isPublicPage = to.meta.auth === false

  if (isPublicPage) {
    if (to.path === '/login' && loggedIn.value) {
      const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
      return navigateTo(redirect)
    }

    return
  }

  if (!loggedIn.value) {
    return navigateTo({
      path: '/login',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined
    })
  }
})
