import { createSharedComposable } from '@vueuse/core'

export const dashboardThemes = ['outlook', 'excel'] as const

export type DashboardTheme = typeof dashboardThemes[number]

type DashboardThemeOption = {
  value: DashboardTheme
  label: string
  description: string
  icon: string
  appClass: string
  primaryColor: 'outlook' | 'excel'
  neutralColor: 'slate' | 'zinc'
  swatch: string
}

export const dashboardThemeOptions: DashboardThemeOption[] = [{
  value: 'outlook',
  label: 'Outlook',
  description: 'Bleu Microsoft Outlook pour le shell et les actions principales.',
  icon: 'i-lucide-mail',
  appClass: 'outlook-app',
  primaryColor: 'outlook',
  neutralColor: 'slate',
  swatch: '#0f6cbd'
}, {
  value: 'excel',
  label: 'Excel',
  description: 'Vert Microsoft Excel pour le shell et les actions principales.',
  icon: 'i-lucide-table-2',
  appClass: 'excel-app',
  primaryColor: 'excel',
  neutralColor: 'zinc',
  swatch: '#217346'
}]

export const dashboardThemeLabels = dashboardThemeOptions.reduce((labels, option) => {
  labels[option.value] = option.label

  return labels
}, {} as Record<DashboardTheme, string>)

function normalizeDashboardTheme(value: unknown): DashboardTheme {
  return value === 'excel' ? 'excel' : 'outlook'
}

function getDashboardThemeOption(theme: DashboardTheme) {
  return dashboardThemeOptions.find(option => option.value === theme) || dashboardThemeOptions[0]!
}

const _useDashboardTheme = () => {
  const appConfig = useAppConfig()
  const themeCookie = useCookie<DashboardTheme>('mw-dashboard-theme', {
    default: () => 'outlook',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax'
  })

  if (themeCookie.value !== normalizeDashboardTheme(themeCookie.value)) {
    themeCookie.value = 'outlook'
  }

  const dashboardTheme = computed<DashboardTheme>({
    get: () => normalizeDashboardTheme(themeCookie.value),
    set: (value) => {
      themeCookie.value = normalizeDashboardTheme(value)
    }
  })

  const currentDashboardTheme = computed(() => getDashboardThemeOption(dashboardTheme.value))

  watchEffect(() => {
    const option = currentDashboardTheme.value

    appConfig.ui.colors.primary = option.primaryColor
    appConfig.ui.colors.neutral = option.neutralColor
  })

  return {
    dashboardTheme,
    dashboardThemes,
    dashboardThemeOptions,
    dashboardThemeLabels,
    currentDashboardTheme,
    isExcelDashboardTheme: computed(() => dashboardTheme.value === 'excel')
  }
}

export const useDashboardTheme = createSharedComposable(_useDashboardTheme)
