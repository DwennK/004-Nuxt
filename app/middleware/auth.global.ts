export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (to.path === '/login') {
    if (loggedIn.value) {
      return navigateTo('/')
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
