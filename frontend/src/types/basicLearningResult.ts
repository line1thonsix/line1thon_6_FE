export type BasicLearningResult = {
  chatId: string; transitionId: string; resultId: string
  learningPath: 'BASIC'; status: 'DONE'; excludeFromGrowth: true
  referenceAnswer: string; concept: string; exampleCode: string
  steps: [{ title: string; text: string }, { title: string; text: string }]
}
