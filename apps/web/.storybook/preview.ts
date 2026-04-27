import type { Preview } from '@storybook/react'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    backgrounds: {
      default: 'gray-50',
      values: [
        { name: 'gray-50', value: '#f9fafb' },
        { name: 'white',   value: '#ffffff' },
      ],
    },
  },
}
export default preview
