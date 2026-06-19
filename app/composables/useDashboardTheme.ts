import { createSharedComposable } from '@vueuse/core'

export const dashboardThemes = ['default', 'premium'] as const

export type DashboardTheme = typeof dashboardThemes[number]

export const dashboardThemeLabels: Record<DashboardTheme, string> = {
  default: 'Default',
  premium: 'Premium'
}

function normalizeDashboardTheme(value: unknown): DashboardTheme {
  return value === 'premium' ? 'premium' : 'default'
}

const _useDashboardTheme = () => {
  const themeCookie = useCookie<DashboardTheme>('mw-dashboard-theme', {
    default: () => 'default',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax'
  })

  if (themeCookie.value !== normalizeDashboardTheme(themeCookie.value)) {
    themeCookie.value = 'default'
  }

  const dashboardTheme = computed<DashboardTheme>({
    get: () => normalizeDashboardTheme(themeCookie.value),
    set: (value) => {
      themeCookie.value = normalizeDashboardTheme(value)
    }
  })

  return {
    dashboardTheme,
    dashboardThemes,
    dashboardThemeLabels,
    isPremiumDashboardTheme: computed(() => dashboardTheme.value === 'premium')
  }
}

export const useDashboardTheme = createSharedComposable(_useDashboardTheme)
