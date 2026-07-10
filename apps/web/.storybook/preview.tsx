import type { Preview, Decorator } from '@storybook/react'
import React, { useEffect } from 'react'
import '../src/index.css'

/**
 * Theme toggle that matches production: index.html sets `.dark` on <html>
 * pre-paint and src/ui/tokens.css keys every semantic token off that class.
 * A Storybook "backgrounds" swap alone would NOT flip the tokens, so stories
 * would silently render light-theme colors on a dark canvas. This decorator
 * drives the real mechanism.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string) ?? 'light'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return (
    <div className="bg-canvas p-6 min-h-24">
      <Story />
    </div>
  )
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Light / dark theme (drives the real `.dark` class)',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [withTheme],
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // axe severity gate mirrors tests/e2e/a11y.spec.ts: block on the impacts
    // the CI suite blocks on.
    a11y: { config: {}, options: {} },
  },
}
export default preview
