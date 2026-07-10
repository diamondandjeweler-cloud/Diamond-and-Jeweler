import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardBody, CardHeader } from './Card'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    as: { control: 'select', options: ['div', 'article', 'section'] },
    hoverable: { control: 'boolean' },
    elevated: { control: 'boolean' },
  },
  args: {
    hoverable: false,
    elevated: false,
    as: 'div',
  },
}
export default meta
type Story = StoryObj<typeof Card>

const body = (
  <CardBody>
    <p className="text-sm text-fg-muted">
      Cards group related content on a surface. This body uses the default p-6 padding.
    </p>
  </CardBody>
)

export const Default: Story = {
  args: { children: body },
}

export const Elevated: Story = {
  args: { elevated: true, children: body },
}

export const Hoverable: Story = {
  args: { hoverable: true, children: body },
}

export const ElevatedHoverable: Story = {
  args: { elevated: true, hoverable: true, children: body },
}

export const WithHeader: Story = {
  args: {
    children: (
      <>
        <CardHeader
          eyebrow="Pipeline"
          title="Open applications"
          subtitle="Candidates currently mid-process"
          right={<button className="btn-secondary btn-sm">View all</button>}
        />
        {body}
      </>
    ),
  },
}

export const HeaderTitleOnly: Story = {
  args: {
    children: (
      <>
        <CardHeader title="Minimal header" />
        {body}
      </>
    ),
  },
}

/** Long title exercises the truncate on the h2 and min-w-0 on the left column. */
export const HeaderTruncation: Story = {
  args: {
    className: 'max-w-sm',
    children: (
      <>
        <CardHeader
          eyebrow="Truncation"
          title="An unreasonably long card title that should truncate instead of wrapping or overflowing"
          subtitle="Subtitle stays on its own line"
          right={<button className="btn-secondary btn-sm">Action</button>}
        />
        {body}
      </>
    ),
  },
}

/** Renders as a semantic <article> — styling identical, element swapped. */
export const AsArticle: Story = {
  args: { as: 'article', children: body },
}

export const AsSection: Story = {
  args: { as: 'section', children: body },
}

/** Caller className wins conflicts via twMerge (here it overrides nothing, just constrains width). */
export const CustomClassName: Story = {
  args: { className: 'max-w-xs', children: body },
}

/** All four elevation/hover combinations side by side for visual regression. */
export const Matrix: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-6 max-w-2xl">
      <Card>
        <CardHeader title="Default" subtitle="shadow-soft" />
        {body}
      </Card>
      <Card elevated>
        <CardHeader title="Elevated" subtitle="inset highlight + drop" />
        {body}
      </Card>
      <Card hoverable>
        <CardHeader title="Hoverable" subtitle="hover me" />
        {body}
      </Card>
      <Card elevated hoverable>
        <CardHeader title="Elevated + hoverable" subtitle="hover me" />
        {body}
      </Card>
    </div>
  ),
}

/** Same matrix under `.dark` — tokens flip via the ancestor class, no dark: needed. */
export const DarkMatrix: Story = {
  render: () => (
    <div className="dark bg-canvas p-8 rounded-xl2">
      <div className="grid grid-cols-2 gap-6 max-w-2xl">
        <Card>
          <CardHeader title="Default" subtitle="shadow-soft" />
          {body}
        </Card>
        <Card elevated>
          <CardHeader title="Elevated" subtitle="dimmed inset + deep drop" />
          {body}
        </Card>
        <Card hoverable>
          <CardHeader title="Hoverable" subtitle="hover me" />
          {body}
        </Card>
        <Card elevated hoverable>
          <CardHeader title="Elevated + hoverable" subtitle="hover me" />
          {body}
        </Card>
      </div>
    </div>
  ),
  parameters: { backgrounds: { default: 'dark' } },
}
