/** 10 leadership-style questions for hiring managers. */
export interface LeadershipQuestion {
  text: string
  options: { label: string; tags: Record<string, number> }[]
}

export const LEADERSHIP_QUESTIONS: LeadershipQuestion[] = [
  {
    text: 'When a team member makes a mistake, what is your typical first reaction?',
    options: [
      { label: 'Coach them through it', tags: { supportive: 1.0, collaborator: 0.7 } },
      { label: 'Note it for later review', tags: { analytical: 0.8 } },
      { label: 'Express frustration', tags: { high_performance: 0.6 } },
      { label: 'Ignore if minor', tags: { autonomous: 0.6 } },
    ],
  },
  {
    text: 'How often do you give feedback?',
    options: [
      { label: 'Weekly', tags: { clear_communicator: 1.0 } },
      { label: 'Monthly', tags: { clear_communicator: 0.6 } },
      { label: 'Only at formal reviews', tags: {} },
      { label: 'Rarely', tags: {} },
    ],
  },
  {
    text: 'What is your stance on flexible working hours?',
    options: [
      { label: 'Fully flexible', tags: { offers_flexibility: 1.0 } },
      { label: 'Hybrid', tags: { offers_flexibility: 0.7 } },
      { label: 'Fixed with occasional flexibility', tags: { offers_flexibility: 0.3 } },
      { label: 'Strict office hours', tags: {} },
    ],
  },
  {
    text: 'How much autonomy do you give your team?',
    options: [
      { label: 'Complete autonomy', tags: { offers_autonomy: 1.0 } },
      { label: 'Moderate', tags: { offers_autonomy: 0.6 } },
      { label: 'Low', tags: {} },
      { label: 'Very low', tags: {} },
    ],
  },
  {
    text: 'How do you recognise exceptional work?',
    options: [
      { label: 'Public praise', tags: { gives_recognition: 1.0 } },
      { label: 'Private reward', tags: { gives_recognition: 0.7 } },
      { label: 'Note for promotion', tags: { offers_growth: 0.6 } },
      { label: 'Rarely', tags: {} },
    ],
  },
  {
    text: 'How do you handle conflict between team members?',
    options: [
      { label: 'Mediate directly', tags: { supportive: 0.8, collaborator: 0.8 } },
      { label: 'Listen and decide', tags: { analytical: 0.7 } },
      { label: 'Let them figure it out', tags: { offers_autonomy: 0.6 } },
      { label: 'Assign blame', tags: {} },
    ],
  },
  {
    text: 'How do you support career growth?',
    options: [
      { label: 'Active 1:1 planning', tags: { offers_growth: 1.0, supportive: 0.8 } },
      { label: 'Approve if asked', tags: { offers_growth: 0.4 } },
      { label: 'They own their growth', tags: { offers_autonomy: 0.6 } },
      { label: 'No time for that', tags: {} },
    ],
  },
  {
    text: 'How do you communicate important updates?',
    options: [
      { label: 'Open door — anytime', tags: { clear_communicator: 0.9, supportive: 0.6 } },
      { label: 'Scheduled meetings', tags: { clear_communicator: 0.8 } },
      { label: 'Only when necessary', tags: {} },
      { label: 'Change first, announce later', tags: {} },
    ],
  },
  {
    text: 'How transparent are you about salary and promotion?',
    options: [
      { label: 'Fully transparent', tags: { transparent: 1.0, fair: 0.8 } },
      { label: 'Partially', tags: { transparent: 0.4 } },
      { label: 'Not transparent', tags: {} },
    ],
  },
  {
    text: 'What team culture do you aim to build?',
    options: [
      { label: 'High performance', tags: { high_performance: 1.0 } },
      { label: 'Collaborative', tags: { collaborator: 1.0 } },
      { label: 'Stable & dependable', tags: { reliable: 1.0 } },
      { label: 'Innovative', tags: { growth_minded: 1.0 } },
    ],
  },
]
